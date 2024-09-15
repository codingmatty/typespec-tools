import * as prettier from "prettier";
import {
  EmitContext,
  Model,
  ModelProperty,
  Operation,
} from "@typespec/compiler";
import {
  getAllHttpServices,
  getOperationParameters,
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
  SourceFile,
  StringBuilder,
} from "@typespec/compiler/emitter-framework";
import { TypescriptEmitter } from "@typespec-tools/emitter-typescript";
import { EmitterOptions } from "./lib.js";

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
      // console.log("prop :", prop);
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
      cb.push(
        code`${prop.name}${prop.optional ? "?" : ""}: ${this.emitter.emitTypeReference(prop.type)};`
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

    const routerHandlerTypes: string[] = [];
    const typedRouterCallbackTypes: string[] = [];
    const routeHandlerFunctions: string[] = [];
    const operationNames: string[] = [];
    for (const httpService of httpServices) {
      for (const operation of httpService.operations) {
        const operationName = operation.operation.name;
        operationNames.push(operationName);
        routerHandlerTypes.push(
          `export type ${operationName}Handler = express.RequestHandler<${operationName}Params,${operationName}ResponseBody,${operationName}Body,${operationName}Query>;`
        );
        typedRouterCallbackTypes.push(
          `${operationName}: (...handlers: Array<${operationName}Handler>) => void;`
        );
        routeHandlerFunctions.push(
          `const ${operationName}: TypedRouter["${operationName}"] = (...handlers) => { router.${operation.verb}('${operation.path}', ...handlers); };`
        );
      }
    }

    emittedSourceFile.contents += `
    ${routerHandlerTypes.join("\n")}
    export interface TypedRouter {
      router: express.Router;
      ${typedRouterCallbackTypes.join("\n")}
    }

    export function createTypedRouter(router: express.Router): TypedRouter {
      ${routeHandlerFunctions.join("\n")}

      return {
        router,
        ${operationNames.join(",\n")}
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
