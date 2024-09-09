import * as prettier from "prettier";
import {
  BooleanLiteral,
  Enum,
  EnumMember,
  getDoc,
  Interface,
  IntrinsicType,
  Model,
  ModelProperty,
  NumericLiteral,
  Operation,
  Scalar,
  StringLiteral,
  Tuple,
  Type,
  Union,
  UnionVariant,
} from "@typespec/compiler";

import {
  code,
  CodeTypeEmitter,
  Context,
  Declaration,
  EmittedSourceFile,
  EmitterOutput,
  Scope,
  SourceFile,
  SourceFileScope,
  StringBuilder,
} from "@typespec/compiler/emitter-framework";

export function isArrayType(m: Model) {
  return m.name === "Array";
}

export const intrinsicNameToTSType = new Map<string, string>([
  ["string", "z.string()"],
  ["int32", "z.number()"],
  ["int16", "z.number()"],
  ["float16", "z.number()"],
  ["float32", "z.number()"],
  ["int64", "z.bigint()"],
  ["boolean", "z.boolean()"],
  ["unknown", "z.unknown()"],
  ["null", "z.null()"],
  ["never", "z.never()"],
  ["void", "z.void()"],
]);

export class ZodEmitter extends CodeTypeEmitter {
  // type literals
  booleanLiteral(boolean: BooleanLiteral): EmitterOutput<string> {
    return code`z.literal(${JSON.stringify(boolean.value)})`;
  }

  numericLiteral(number: NumericLiteral): EmitterOutput<string> {
    return code`z.literal(${JSON.stringify(number.value)})`;
  }

  stringLiteral(string: StringLiteral): EmitterOutput<string> {
    return code`z.literal(${JSON.stringify(string.value)})`;
  }

  scalarDeclaration(scalar: Scalar, scalarName: string): EmitterOutput<string> {
    if (!intrinsicNameToTSType.has(scalarName) && scalar.baseScalar) {
      return this.scalarDeclaration(scalar.baseScalar, scalar.baseScalar.name);
    } else if (!intrinsicNameToTSType.has(scalarName)) {
      throw new Error("Unknown scalar type " + scalarName);
    }

    const code = intrinsicNameToTSType.get(scalarName)!;
    return this.emitter.result.rawCode(code);
  }

  intrinsic(intrinsic: IntrinsicType, name: string): EmitterOutput<string> {
    if (!intrinsicNameToTSType.has(name)) {
      throw new Error("Unknown intrinsic type " + name);
    }

    const code = intrinsicNameToTSType.get(name)!;
    return this.emitter.result.rawCode(code);
  }

  modelLiteral(model: Model): EmitterOutput<string> {
    return this.emitter.result.rawCode(
      code`z.object({ ${this.emitter.emitModelProperties(model)} })`
    );
  }

  modelDeclaration(model: Model, name: string): EmitterOutput<string> {
    const comment = getDoc(this.emitter.getProgram(), model);
    let commentCode = "";

    if (comment) {
      commentCode = `
        /**
         * ${comment}
         */`;
    }

    return this.emitter.result.declaration(
      name,
      code`${commentCode}\nexport const ${name}Schema = z.object({
        ${this.emitter.emitModelProperties(model)}
    })`
    );
  }

  modelInstantiation(model: Model, name: string): EmitterOutput<string> {
    if (this.emitter.getProgram().checker.isStdType(model, "Record")) {
      const indexerValue = model.indexer!.value;
      return code`Record<string, ${this.emitter.emitTypeReference(indexerValue)}>`;
    }
    return this.modelDeclaration(model, name);
  }

  modelPropertyLiteral(property: ModelProperty): EmitterOutput<string> {
    const name = property.name === "_" ? "statusCode" : property.name;
    const doc = getDoc(this.emitter.getProgram(), property);
    let docString = "";

    if (doc) {
      docString = `
      /**
       * ${doc}
       */
      `;
    }

    return this.emitter.result.rawCode(
      code`${docString}${name}: ${this.emitter.emitTypeReference(
        property.type
      )}${property.optional ? ".optional()" : ""}`
    );
  }

  arrayDeclaration(
    array: Model,
    name: string,
    elementType: Type
  ): EmitterOutput<string> {
    return this.emitter.result.declaration(
      name,
      code`export const ${name}Schema = z.array(${this.emitter.emitTypeReference(elementType)});`
    );
  }

  arrayLiteral(array: Model, elementType: Type): EmitterOutput<string> {
    // we always parenthesize here as prettier will remove the unneeded parens.
    return this.emitter.result.rawCode(
      code`z.array(${this.emitter.emitTypeReference(elementType)})`
    );
  }

  operationDeclaration(
    operation: Operation,
    name: string
  ): EmitterOutput<string> {
    const argsOutput = code`.args(${this.emitter.emitOperationParameters(operation)})`;
    const returnsOutput = code`.returns(${this.emitter.emitOperationReturnType(operation)})`;
    return this.emitter.result.declaration(
      name,
      code`export const ${name}Schema = z.function()${argsOutput}${returnsOutput}`
    );
  }

  operationParameters(
    operation: Operation,
    parameters: Model
  ): EmitterOutput<string> {
    const cb = new StringBuilder();
    if (parameters.properties.size === 1) {
      const prop = parameters.properties.values().next().value;
      return code`${this.emitter.emitTypeReference(prop.type)}${prop.optional ? ".optional()" : ""}`;
    }
    for (const prop of parameters.properties.values()) {
      cb.push(
        code`${this.emitter.emitTypeReference(prop.type)}${prop.optional ? ".optional()" : ""},`
      );
    }
    return cb;
  }

  operationReturnType(
    operation: Operation,
    returnType: Type
  ): EmitterOutput<string> {
    return this.emitter.emitTypeReference(returnType);
  }

  interfaceDeclaration(iface: Interface, name: string): EmitterOutput<string> {
    return this.emitter.result.declaration(
      name,
      code`
      export const ${name}Schema = z.object({
        ${this.emitter.emitInterfaceOperations(iface)}
      })
    `
    );
  }

  interfaceOperationDeclaration(
    operation: Operation,
    name: string
  ): EmitterOutput<string> {
    const argsOutput = code`.args(${this.emitter.emitOperationParameters(operation)})`;
    const returnsOutput = code`.returns(${this.emitter.emitOperationReturnType(operation)})`;
    return code`${name}: z.function()${argsOutput}${returnsOutput}`;
  }

  enumDeclaration(en: Enum, name: string): EmitterOutput<string> {
    return this.emitter.result.declaration(
      name,
      code`export enum ${name}Enum {
        ${this.emitter.emitEnumMembers(en)}
      }`
    );
  }

  enumMember(member: EnumMember): EmitterOutput<string> {
    // should we just fill in value for you?
    const value = !member.value ? member.name : member.value;

    return `
      ${member.name} = ${JSON.stringify(value)}
    `;
  }

  enumMemberReference(member: EnumMember): EmitterOutput<string> {
    return `${this.emitter.emitDeclarationName(member.enum)}.${member.name}`;
  }

  unionDeclaration(union: Union, name: string): EmitterOutput<string> {
    return this.emitter.result.declaration(
      name,
      code`export const ${name}Schema = ${this.emitter.emitUnionVariants(union)}`
    );
  }

  unionInstantiation(union: Union, name: string): EmitterOutput<string> {
    return this.unionDeclaration(union, name);
  }

  unionLiteral(union: Union) {
    return this.emitter.emitUnionVariants(union);
  }

  unionVariants(union: Union): EmitterOutput<string> {
    const builder = new StringBuilder();

    let i = 0;
    builder.push(code`z.union([`);
    for (const variant of union.variants.values()) {
      i++;
      builder.push(
        code`${this.emitter.emitType(variant)}${i < union.variants.size ? "," : ""}`
      );
    }
    builder.push(code`])`);

    return this.emitter.result.rawCode(builder.reduce());
  }

  unionVariant(variant: UnionVariant): EmitterOutput<string> {
    return this.emitter.emitTypeReference(variant.type);
  }

  tupleLiteral(tuple: Tuple): EmitterOutput<string> {
    return code`z.tuple([${this.emitter.emitTupleLiteralValues(tuple)}])`;
  }

  reference(
    targetDeclaration: Declaration<string>,
    pathUp: Scope<string>[],
    pathDown: Scope<string>[],
    commonScope: Scope<string> | null
  ) {
    if (!commonScope) {
      const sourceSf = (pathUp[0] as SourceFileScope<string>).sourceFile;
      const targetSf = (pathDown[0] as SourceFileScope<string>).sourceFile;
      sourceSf.imports.set(`./${targetSf.path.replace(".js", ".ts")}`, [
        targetDeclaration.name,
      ]);
    }

    if (
      targetDeclaration.value
        .toString()
        .startsWith(`export enum ${targetDeclaration.name}Enum`)
    ) {
      return `z.nativeEnum(${targetDeclaration.name}Enum)`;
    }

    const basePath = pathDown.map((s) => s.name).join(".");
    return basePath
      ? this.emitter.result.rawCode(
          `${basePath}.${targetDeclaration.name}Schema`
        )
      : this.emitter.result.rawCode(`${targetDeclaration.name}Schema`);
  }

  async sourceFile(sourceFile: SourceFile<string>): Promise<EmittedSourceFile> {
    const emittedSourceFile: EmittedSourceFile = {
      path: sourceFile.path,
      contents: `import { z } from "zod";\n`,
    };

    for (const [importPath, typeNames] of sourceFile.imports) {
      emittedSourceFile.contents += `import {${typeNames.join(",")}} from "${importPath}";\n`;
    }

    for (const decl of sourceFile.globalScope.declarations) {
      emittedSourceFile.contents += decl.value + "\n";
    }

    emittedSourceFile.contents = await prettier.format(
      emittedSourceFile.contents,
      {
        parser: "typescript",
      }
    );
    return emittedSourceFile;
  }
}

export class SingleFileZodEmitter extends ZodEmitter {
  programContext(): Context {
    const outputFile = this.emitter.createSourceFile("output.ts");
    return { scope: outputFile.globalScope };
  }
}
