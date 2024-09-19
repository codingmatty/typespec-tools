import * as prettier from "prettier";
import {
  EmitContext,
  getNamespaceFullName,
  ModelProperty,
  Operation,
} from "@typespec/compiler";
import {
  getAllHttpServices,
  isBody,
  isBodyIgnore,
  isBodyRoot,
  isPathParam,
  isQueryParam,
  listHttpOperationsIn,
} from "@typespec/http";
import {
  code,
  Context,
  createAssetEmitter,
  Declaration,
  EmittedSourceFile,
  EmitterOutput,
  SourceFile,
  StringBuilder,
} from "@typespec/compiler/emitter-framework";
import { TypescriptEmitter } from "@typespec-tools/emitter-typescript";

import { EmitterOptions } from "./lib.js";

type NamespaceDeclarations = {
  typedRouterCallbackTypes: string[];
  routeHandlerFunctions: string[];
  operationNames: string[];
  namespaceChain: string[];
};

export class ExpressEmitter extends TypescriptEmitter<EmitterOptions> {
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

    const declarationsByNamespace: Map<string, NamespaceDeclarations> =
      new Map();

    for (const httpService of httpServices) {
      const [operations] = listHttpOperationsIn(program, httpService.namespace);

      for (const operation of operations) {
        const namespace =
          operation.operation.namespace?.name ?? httpService.namespace.name;
        const namespaceChain = operation.operation.namespace
          ? getNamespaceFullName(operation.operation.namespace).split(".")
          : [];
        const declarations = declarationsByNamespace.get(namespace) ?? {
          typedRouterCallbackTypes: [],
          routeHandlerFunctions: [],
          operationNames: [],
          namespaceChain,
        };

        const handlerType = `${operation.operation.name}Handler`;
        const operationName = operation.operation.name;
        declarations.operationNames.push(operationName);
        declarations.typedRouterCallbackTypes.push(
          `${operationName}: (...handlers: Array<${handlerType}>) => void;`
        );
        declarations.routeHandlerFunctions.push(
          `const ${operationName}: ${namespaceChain.join(".")}.Handlers["${operationName}"] = (...handlers) => { router.${operation.verb}('${operation.path.replace(/\{(\w+)\}/, ":$1")}', ...handlers); };`
        );

        declarationsByNamespace.set(namespace, declarations);
      }
    }

    const handlerFunctions: string[] = [];

    for (const [
      namespaceName,
      {
        typedRouterCallbackTypes,
        routeHandlerFunctions,
        operationNames,
        namespaceChain,
      },
    ] of declarationsByNamespace) {
      const nsScope = this.nsByName.get(namespaceName);
      const childrenOperations = nsScope?.childScopes;

      nsScope?.declarations.push(
        new Declaration(
          "",
          nsScope,
          `\n
        export interface Handlers {
          ${typedRouterCallbackTypes.join("\n")}
          ${childrenOperations?.map((c) => `${c.name}: ${c.name}.Handlers;`).join("\n")}
        }
      `
        )
      );

      handlerFunctions.push(
        `export function create${namespaceChain.join("")}Handlers(router: express.Router): ${namespaceChain.join(".")}.Handlers {
            ${routeHandlerFunctions.join("\n")}
  
            return {
              ${[
                ...operationNames,
                childrenOperations?.map(
                  (c) =>
                    `${c.name}: create${namespaceChain.join("")}${c.name}Handlers(router)`
                ),
              ].join(",\n")}
              
            };
          }`
      );
    }

    emittedSourceFile.contents += this.emitNamespaces(sourceFile.globalScope);

    const namespaces = Array.from(declarationsByNamespace.values());

    emittedSourceFile.contents += `\n
      ${handlerFunctions.join("\n")}
      
      export interface TypedRouter {
        router: express.Router;
        ${namespaces.map(({ namespaceChain }) => `${namespaceChain.join("")}: ${namespaceChain.join(".")}.Handlers;`).join("\n")}
      }

      export function createTypedRouter(router: express.Router): TypedRouter {
        return {
          router,
          ${namespaces.map(({ namespaceChain }) => `${namespaceChain.join("")}: create${namespaceChain.join("")}Handlers(router),`).join("\n")}
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
