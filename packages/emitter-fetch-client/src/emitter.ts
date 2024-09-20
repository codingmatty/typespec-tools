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
  typedClientCallbackTypes: string[];
  routeHandlerFunctions: string[];
  operationNames: string[];
  namespaceChain: string[];
};

export class FetchClientEmitter extends TypescriptEmitter<EmitterOptions> {
  operationHasBody(operation: Operation): boolean {
    const program = this.emitter.getProgram();
    return Array.from(operation.parameters.properties.values()).some(
      (prop) =>
        isBody(program, prop) ||
        isBodyRoot(program, prop) ||
        !(
          isQueryParam(program, prop) ||
          isPathParam(program, prop) ||
          isBodyIgnore(program, prop)
        )
    );
  }

  operationHasQuery(operation: Operation): boolean {
    const program = this.emitter.getProgram();
    return Array.from(operation.parameters.properties.values()).some((prop) =>
      isQueryParam(program, prop)
    );
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

    if (pathParams.length > 0) {
      cb.push(code`export type ${name}Params = {`);
      for (const prop of pathParams) {
        // Note: scalars are always strings in express
        cb.push(
          code`${prop.name}${prop.optional ? "?" : ""}: ${prop.type.kind === "Scalar" ? "string" : this.emitter.emitTypeReference(prop.type)};`
        );
      }
      cb.push(code`};`);
    }

    if (queryParams.length > 0) {
      cb.push(code`export type ${name}Query = {`);
      for (const prop of queryParams) {
        cb.push(
          code`${prop.name}${prop.optional ? "?" : ""}: ${this.emitter.emitTypeReference(prop.type)};`
        );
      }
      cb.push(code`};`);
    }

    if (bodyParams.length > 0) {
      cb.push(code`export type ${name}Body = {`);
      for (const prop of bodyParams) {
        cb.push(
          code`${prop.name}${prop.optional ? "?" : ""}: ${this.emitter.emitTypeReference(prop.type)};`
        );
      }
      cb.push(code`};`);
    } else if (bodyParam) {
      const bodyOutput = code`${bodyParam.optional ? "undefined | " : ""}${bodyParam ? this.emitter.emitTypeReference(bodyParam.type) : ""}`;
      cb.push(code`export type ${name}Body = ${bodyOutput};`);
    }

    cb.push(
      code`export type ${name}ResponseBody = ${this.emitter.emitTypeReference(operation.returnType)};`
    );

    const argsTypeParts = [
      pathParams.length > 0 ? `${name}Params` : null,
      queryParams.length > 0 ? `{query:${name}Query}` : null,
      bodyParams.length > 0 || bodyParam ? `{body: ${name}Body}` : null,
    ]
      .filter(Boolean)
      .join(" & ");
    cb.push(
      code`export type ${name}ClientArgs = ${argsTypeParts || "undefined"};`
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

    for (const [importPath, typeNames] of sourceFile.imports) {
      emittedSourceFile.contents += `import {${typeNames.join(",")}} from "${importPath}";\n`;
    }

    for (const decl of sourceFile.globalScope.declarations) {
      emittedSourceFile.contents += decl.value + "\n";
    }

    emittedSourceFile.contents += `
      function queryParamsToString(query: Record<string, any>): string {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        queryParams.append(key, value.toString());
      }
      return \`\${queryParams.size > 0 ?'?' : ''}\${queryParams.toString()}\`;
    }
    `;

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
          typedClientCallbackTypes: [],
          routeHandlerFunctions: [],
          operationNames: [],
          namespaceChain,
        };

        const handlerType = `${operation.operation.name}Client`;
        const operationName = operation.operation.name;
        declarations.operationNames.push(operationName);
        declarations.typedClientCallbackTypes.push(
          `${operationName}: (args: ${handlerType}Args, options?: RequestInit) => Promise<${operationName}ResponseBody>;`
        );
        declarations.routeHandlerFunctions.push(
          `const ${operationName}: ${namespaceChain.join(".")}.Client["${operationName}"] = async (args, options) => { 
            const queryString = ${this.operationHasQuery(operation.operation) ? `queryParamsToString(args.query)` : '""'};
            const path = \`\${baseUrl}${operation.path.replace(/\{(\w+)\}/, "${args.$1}")}\${queryString}\`;
            const opts: RequestInit = {
              method: '${operation.verb.toUpperCase()}',
              ${
                this.operationHasBody(operation.operation)
                  ? `body: JSON.stringify(args.body),`
                  : ""
              }
              headers: {
                ...defaultOptions?.headers,
                ...options?.headers,
                'Content-Type': 'application/json',
              },
            };
            
            const res = await fetch(path, opts);
            if (!res.ok) {
              throw new Error(\`Request failed with status \${res.status}\`);
            }
            return res.json();
          };`
        );

        declarationsByNamespace.set(namespace, declarations);
      }
    }

    const handlerFunctions: string[] = [];

    for (const [
      namespaceName,
      {
        typedClientCallbackTypes,
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
        export interface Client {
          ${typedClientCallbackTypes.join("\n")}
          ${childrenOperations?.map((c) => `${c.name}: ${c.name}.Client;`).join("\n")}
        }
      `
        )
      );

      handlerFunctions.push(
        `export function create${namespaceChain.join("")}Client(baseUrl: string, defaultOptions?: RequestInit): ${namespaceChain.join(".")}.Client {
            ${routeHandlerFunctions.join("\n")}
  
            return {
              ${[
                ...operationNames,
                childrenOperations?.map(
                  (c) =>
                    `${c.name}: create${namespaceChain.join("")}${c.name}Client(baseUrl)`
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
      
      export interface TypedClient {
        ${namespaces.map(({ namespaceChain }) => `${namespaceChain.join("")}: ${namespaceChain.join(".")}.Client;`).join("\n")}
      }

      export function createTypedClient(baseUrl: string, defaultOptions?: RequestInit): TypedClient {
        return {
          ${namespaces.map(({ namespaceChain }) => `${namespaceChain.join("")}: create${namespaceChain.join("")}Client(baseUrl, defaultOptions),`).join("\n")}
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

export class SingleFileFetchClientEmitter extends FetchClientEmitter {
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
    SingleFileFetchClientEmitter,
    context
  );
  // emit my entire TypeSpec program
  assetEmitter.emitProgram();
  // lastly, write your emit output into the output directory
  await assetEmitter.writeOutput();
}
