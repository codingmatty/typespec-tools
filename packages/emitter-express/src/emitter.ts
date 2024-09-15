import * as prettier from "prettier";
import {
  EmitContext,
  Model,
  ModelProperty,
  Namespace,
  Operation,
} from "@typespec/compiler";
import {
  getAllHttpServices,
  isBody,
  isBodyIgnore,
  isBodyRoot,
  isPathParam,
  isQueryParam,
} from "@typespec/http";
import {
  code,
  Context,
  createAssetEmitter,
  EmittedSourceFile,
  EmitterOutput,
  Scope,
  SourceFile,
  StringBuilder,
} from "@typespec/compiler/emitter-framework";
import { TypescriptEmitter } from "@typespec-tools/emitter-typescript";

import { EmitterOptions } from "./lib.js";

function emitNamespaces(scope: Scope<string>) {
  let res = "";
  for (const childScope of scope.childScopes) {
    res += emitNamespace(childScope);
  }
  return res;
}
function emitNamespace(scope: Scope<string>) {
  let ns = `export namespace ${scope.name} {\n`;
  ns += emitNamespaces(scope);
  for (const decl of scope.declarations) {
    ns += decl.value + "\n";
  }
  ns += `}\n`;

  return ns;
}

export class ExpressEmitter extends TypescriptEmitter<EmitterOptions> {
  private nsByName: Map<string, Scope<string>> = new Map();

  #DeclarationContext(decl: { namespace?: Namespace }): Context {
    const name = decl.namespace?.name;
    if (!name) return {};

    let nsScope = this.nsByName.get(name);
    if (!nsScope) {
      nsScope = this.emitter.createScope(
        {},
        name,
        this.emitter.getContext().scope
      );
      this.nsByName.set(name, nsScope);
    }

    return {
      scope: nsScope,
    };
  }

  modelDeclarationContext(model: Model): Context {
    return this.#DeclarationContext(model);
  }

  operationDeclarationContext(operation: Operation): Context {
    return this.#DeclarationContext(operation);
  }

  operationDeclaration(
    operation: Operation,
    name: string
  ): EmitterOutput<string> {
    const program = this.emitter.getProgram();

    let bodyParam: ModelProperty | undefined;
    const bodyParams: ModelProperty[] = [];
    const pathParams: ModelProperty[] = [];
    const queryParams: ModelProperty[] = [];

    for (const prop of operation.parameters.properties.values()) {
      if (isQueryParam(program, prop)) {
        queryParams.push(prop);
      } else if (isPathParam(program, prop)) {
        pathParams.push(prop);
      } else if (isBody(program, prop)) {
        bodyParam = prop;
      } else if (isBodyRoot(program, prop)) {
        // TODO: filter out non-body fields...
      } else if (isBodyIgnore(program, prop)) {
        // TODO: what to do with this?
      } else {
        bodyParams.push(prop);
      }
    }
    const cb = new StringBuilder();

    cb.push(code`export type ${name}Params = {`);
    for (const prop of pathParams) {
      // Note: scalars are always strings in express
      cb.push(
        code`${prop.name}${prop.optional ? "?" : ""}: ${prop.type.kind === "Scalar" ? "string" : this.emitter.emitTypeReference(prop.type)};`
      );
    }
    cb.push(code`};`);

    cb.push(code`export type ${name}Query = {`);
    for (const prop of queryParams) {
      cb.push(
        code`${prop.name}${prop.optional ? "?" : ""}: ${this.emitter.emitTypeReference(prop.type)};`
      );
    }
    cb.push(code`};`);

    if (bodyParams.length > 0) {
      cb.push(code`export type ${name}Body = {`);
      for (const prop of bodyParams) {
        cb.push(
          code`${prop.name}${prop.optional ? "?" : ""}: ${this.emitter.emitTypeReference(prop.type)};`
        );
      }
      cb.push(code`};`);
    } else {
      const bodyOutput = bodyParam
        ? code`${bodyParam.optional ? "undefined | " : ""}${bodyParam ? this.emitter.emitTypeReference(bodyParam.type) : ""}`
        : "undefined";
      cb.push(code`export type ${name}Body = ${bodyOutput};`);
    }

    cb.push(
      code`export type ${name}ResponseBody = ${this.emitter.emitTypeReference(operation.returnType)};`
    );

    cb.push(
      `export type ${name}Handler = express.RequestHandler<${name}Params,${name}ResponseBody,${name}Body,${name}Query>;`
    );

    return this.emitter.result.declaration(name, cb.reduce());
  }

  async sourceFile(sourceFile: SourceFile<string>): Promise<EmittedSourceFile> {
    const program = this.emitter.getProgram();
    const [httpServices] = getAllHttpServices(program, {});

    const emittedSourceFile: EmittedSourceFile = {
      path: sourceFile.path,
      contents: "",
    };

    emittedSourceFile.contents += `import * as express from "express";\n`;

    for (const [importPath, typeNames] of sourceFile.imports) {
      emittedSourceFile.contents += `import {${typeNames.join(",")}} from "${importPath}";\n`;
    }

    for (const decl of sourceFile.globalScope.declarations) {
      emittedSourceFile.contents += decl.value + "\n";
    }

    emittedSourceFile.contents += emitNamespaces(sourceFile.globalScope);

    const declarationsByNamespace: Map<
      string,
      {
        typedRouterCallbackTypes: string[];
        routeHandlerFunctions: string[];
        operationNames: string[];
      }
    > = new Map();

    for (const httpService of httpServices) {
      for (const operation of httpService.operations) {
        const namespace =
          operation.operation.namespace?.name ?? httpService.namespace.name;
        const declarations = declarationsByNamespace.get(namespace) ?? {
          typedRouterCallbackTypes: [],
          routeHandlerFunctions: [],
          operationNames: [],
        };

        const namespaceName = operation.operation.namespace?.name ?? "";
        const handlerType = namespaceName
          ? `${namespaceName}.${operation.operation.name}Handler`
          : `${operation.operation.name}Handler`;
        const operationName = operation.operation.name;
        declarations.operationNames.push(operationName);
        declarations.typedRouterCallbackTypes.push(
          `${operationName}: (...handlers: Array<${handlerType}>) => void;`
        );
        declarations.routeHandlerFunctions.push(
          `const ${operationName}: ${namespaceName}Handlers["${operationName}"] = (...handlers) => { router.${operation.verb}('${operation.path.replace(/\{(\w+)\}/, ":$1")}', ...handlers); };`
        );

        declarationsByNamespace.set(namespace, declarations);
      }
    }

    for (const [
      namespaceName,
      { typedRouterCallbackTypes, routeHandlerFunctions, operationNames },
    ] of declarationsByNamespace) {
      emittedSourceFile.contents += `\n
        export interface ${namespaceName}Handlers {
          ${typedRouterCallbackTypes.join("\n")}
        }

        export function create${namespaceName}Handlers(router: express.Router): ${namespaceName}Handlers {
          ${routeHandlerFunctions.join("\n")}

          return {
            ${operationNames.join(",\n")}
          };
        }
      `;
    }

    const namespaces = Array.from(declarationsByNamespace.keys());

    emittedSourceFile.contents += `\n
      export interface TypedRouter {
        router: express.Router;
        ${namespaces.map((ns) => `${ns}: ${ns}Handlers;`).join("\n")}
      }

      export function createTypedRouter(router: express.Router): TypedRouter {
        return {
          router,
          ${namespaces.map((ns) => `${ns}: create${ns}Handlers(router),`).join("\n")}
        };
      }
    `;

    emittedSourceFile.contents = await prettier.format(
      emittedSourceFile.contents,
      {
        parser: "typescript",
      }
    );
    return emittedSourceFile;
  }
}

export class SingleFileExpressEmitter extends ExpressEmitter {
  programContext(): Context {
    const options = this.emitter.getOptions();
    const outputFile = this.emitter.createSourceFile(
      options["output-file"] ?? "output.ts"
    );
    return { scope: outputFile.globalScope };
  }
}

export async function $onEmit(context: EmitContext) {
  const assetEmitter = createAssetEmitter(
    context.program,
    SingleFileExpressEmitter,
    context
  );
  // emit my entire TypeSpec program
  assetEmitter.emitProgram();
  // lastly, write your emit output into the output directory
  await assetEmitter.writeOutput();
}
