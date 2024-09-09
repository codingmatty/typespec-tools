import { Enum, Interface, Model, Operation, Union } from "@typespec/compiler";
import {
  AssetEmitter,
  Context,
  EmittedSourceFile,
  EmitterOutput,
  Scope,
  SourceFile,
  TypeSpecDeclaration,
  createAssetEmitter,
} from "@typespec/compiler/emitter-framework";

import assert from "assert";
import * as prettier from "prettier";
import { describe, it } from "vitest";

import { emitTypeSpec, getHostForTypeSpecFile } from "./host.js";
import { SingleFileZodEmitter, ZodEmitter } from "../src/emitter.js";

const testCode = `
model Basic { x: string }
model RefsOtherModel { x: Basic, y: UnionDecl }
model HasNestedLiteral { x: { y: string } }
model HasArrayProperty { x: string[], y: Basic[] }
model IsArray is Array<string>;
model Derived extends Basic { }

@doc("Has a doc")
model HasDoc { @doc("an x property") x: string }

model Template<T> { prop: T }
model HasTemplates { x: Template<Basic> }
model IsTemplate is Template<Basic>;
model HasRef {
  x: Basic.x;
  y: RefsOtherModel.x;
}

op SomeOp(x: string): string;

interface MyInterface {
  op get(): string;
}

union UnionDecl {
  x: int32;
  y: string;
}

enum MyEnum {
  a: "hi";
  b: "bye";
}
`;

class SingleFileTestEmitter extends SingleFileZodEmitter {
  operationReturnTypeReferenceContext(): Context {
    return {
      fromOperation: true,
    };
  }

  modelDeclaration(model: Model, name: string): EmitterOutput<string> {
    const newName = this.emitter.getContext().fromOperation
      ? name + "FromOperation"
      : name;
    return super.modelDeclaration(model, newName);
  }
}

async function emitTypeSpecToTs(code: string) {
  const emitter = await emitTypeSpec(SingleFileTestEmitter, code);

  const sf = await emitter.getProgram().host.readFile("./tsp-output/output.ts");
  return sf.text;
}

describe("emitter-framework: zod emitter", () => {
  it("emits models", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: {
          y: string;
        },
      }
    `);

    /*
    export const ASchema = z.object({
      x: z.object({ y: z.string() }),
    });
    */
    assert.match(contents, /export const ASchema = z.object\(\{/);
    assert.match(contents, /x: z.object\(\{ y: z.string\(\) \}\)/);
  });

  it("emits model templates", async () => {
    const contents = await emitTypeSpecToTs(`
      model Template<T> {
        x: T
      }

      model Test1 is Template<string>;
      model Test2 {
        prop: Template<int32>;
      }
    `);

    /*
    export const Test1Schema = z.object({
      x: z.string(),
    });

    export const TemplateInt32Schema = z.object({
      x: z.number(),
    });

    export const Test2Schema = z.object({
      prop: TemplateInt32Schema,
    });
    */
    assert.match(contents, /export const Test1Schema = z.object\(\{/);
    assert.match(contents, /export const TemplateInt32Schema = z.object\(\{/);
    assert.match(contents, /export const Test2Schema = z.object\(\{/);
    assert.match(contents, /prop: TemplateInt32Schema/);
  });

  it("emits literal types", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: true,
        y: "hi",
        z: 12
      }
    `);

    /*
    export const ASchema = z.object({
      x: z.literal(true),
      y: z.literal("hi"),
      z: z.literal(12),
    });
    */
    assert.match(contents, /x: z.literal\(true\)/);
    assert.match(contents, /y: z.literal\("hi"\)/);
    assert.match(contents, /z: z.literal\(12\)/);
  });

  it("emits unknown", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: unknown
      }
    `);

    assert.match(contents, /x: z.unknown\(\)/);
  });

  it("emits never", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: never
      }
    `);

    assert.match(contents, /x: z.never\(\)/);
  });

  it("emits void", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: void
      }
    `);

    assert.match(contents, /x: z.void\(\)/);
  });

  it("emits array literals", async () => {
    const contents = await emitTypeSpecToTs(`
      model MyArray2 is Array<string>;

      model HasArray {
        x: MyArray2;
        y: string[];
        z: (string | int32)[]
      }
    `);

    /*
    export const MyArray2Schema = z.array(z.string());
    export const HasArraySchema = z.object({
      x: MyArray2Schema,
      y: z.array(z.string()),
      z: z.array(z.union([z.string(), z.number()])),
    });
    */
    assert.match(
      contents,
      /export const MyArray2Schema = z.array\(z.string\(\)\);/
    );
    assert.match(contents, /x: MyArray2Schema/);
    assert.match(contents, /y: z.array\(z.string\(\)\)/);
    assert.match(
      contents,
      /z: z.array\(z.union\(\[z.string\(\), z.number\(\)\]\)\)/
    );
  });

  it("emits arrays of unknown", async () => {
    const contents = await emitTypeSpecToTs(`
      model MyArray2 is Array<unknown>;
    `);

    assert.match(
      contents,
      /export const MyArray2Schema = z.array\(z.unknown\(\)\);/
    );
  });

  // todo: what to do with optionals not at the end??
  it("emits operations", async () => {
    const contents = await emitTypeSpecToTs(`
      model SomeModel {
        x: string;
      }
      op read(x: string, y: int32, z: { inline: true }, q?: SomeModel): string;
    `);

    /*
    export const SomeModelSchema = z.object({
      x: z.string(),
    });
    export const readSchema = z
      .function()
      .args(
        z.string(),
        z.number(),
        z.object({ inline: z.literal(true) }),
        SomeModelSchema.optional(),
      )
      .returns(z.string());
    */
    assert.match(
      contents,
      /export const readSchema = z\s*.function\(\)\s*.args\(/
    );
    assert.match(contents, /z.string\(\)/);
    assert.match(contents, /z.number\(\)/);
    assert.match(contents, /z.object\({ inline: z.literal\(true\) }\)/);
    assert.match(contents, /SomeModelSchema.optional()/);
    assert.match(contents, /.returns\(z.string\(\)\)/);
  });

  it("emits interfaces", async () => {
    const contents = await emitTypeSpecToTs(`
      model Foo {
        prop: string;
      }
      op Callback(x: string): string;

      interface Things {
        op read(x: string): string;
        op write(y: Foo): Foo;
        op callCb(cb: Callback): string;
      }

      interface Template<T> {
        op read(): T;
        op write(): T;
      }

      interface TemplateThings extends Template<string> {}
    `);

    /*
    export const FooSchema = z.object({
      prop: z.string(),
    });
    export const CallbackSchema = z.function().args(z.string()).returns(z.string());

    export const FooFromOperationSchema = z.object({
      prop: z.string(),
    });

    export const ThingsSchema = z.object({
      read: z.function().args(z.string()).returns(z.string()),
      write: z.function().args(FooSchema).returns(FooFromOperationSchema),
      callCb: z.function().args(CallbackSchema).returns(z.string()),
    });

    export const TemplateThingsSchema = z.object({
      read: z.function().args().returns(z.string()),
      write: z.function().args().returns(z.string()),
    });
    */
    assert.match(contents, /export const ThingsSchema = z.object\(/);
    assert.match(
      contents,
      /read: z.function\(\).args\(z.string\(\)\).returns\(z.string\(\)\)/
    );
    assert.match(
      contents,
      /write: z.function\(\).args\(FooSchema\).returns\(FooFromOperationSchema\)/
    );
    assert.match(
      contents,
      /callCb: z.function\(\).args\(CallbackSchema\).returns\(z.string\(\)\)/
    );
    assert.match(contents, /export const TemplateThingsSchema = z.object\(/);
    assert.match(
      contents,
      /read: z.function\(\).args\(\).returns\(z.string\(\)\)/
    );
    assert.match(
      contents,
      /write: z.function\(\).args\(\).returns\(z.string\(\)\)/
    );
  });

  it("emits enums", async () => {
    const contents = await emitTypeSpecToTs(`
      enum StringEnum {
        x; y: "hello";
      }

      enum NumberEnum {
        x: 1;
        y: 2;
        z: 3;
      }
    `);

    assert.match(contents, /enum StringEnum/);
    assert.match(contents, /x = "x"/);
    assert.match(contents, /y = "hello"/);
    assert.match(contents, /x = 1/);
  });

  it("emits unions", async () => {
    const contents = await emitTypeSpecToTs(`
      model SomeModel {
        a: 1 | 2 | SomeModel;
        b: TU<string>;
      };

      union U {
        x: 1,
        y: "hello",
        z: SomeModel
      }

      union TU<T> {
        x: T;
        y: null;
      }

    `);

    /*
    export const TUStringSchema = z.union([z.string(), z.null()]);

    export const SomeModelSchema = z.object({
      a: z.union([z.literal(1), z.literal(2), SomeModelSchema]),
      b: TUStringSchema,
    });
    export const USchema = z.union([
      z.literal(1),
      z.literal(\"hello\"),
      SomeModelSchema,
    ]);
    */

    assert.match(
      contents,
      /a: z.union\(\[z.literal\(1\), z.literal\(2\), SomeModelSchema\]\)/
    );
    assert.match(contents, /b: TUStringSchema/);
    assert.match(
      contents,
      /export const USchema = z.union\(\[\s+z.literal\(1\),\s+z.literal\("hello"\),\s+SomeModelSchema,\s+\]\)/
    );
    assert.match(
      contents,
      /export const TUStringSchema = z.union\(\[z.string\(\), z.null\(\)\]\)/
    );
  });

  it("emits tuple types", async () => {
    const contents = await emitTypeSpecToTs(`
      model Foo {
        x: [string, int32];
      }
    `);

    assert.match(contents, /x: z.tuple\(\[z.string\(\), z.number\(\)\]\)/);
  });

  it("emits enum member references", async () => {
    const contents = await emitTypeSpecToTs(`
      enum MyEnum {
        a: "hi";
        b: "bye";
      }
      
      model EnumReference {
        prop: MyEnum.a;
        prop2: MyEnum.b;
        prop3: MyEnum;
      }
    `);

    assert.match(contents, /prop: MyEnum.a/);
    assert.match(contents, /prop2: MyEnum.b/);
    assert.match(contents, /prop3: z.nativeEnum\(MyEnumEnum\)/);
  });

  it("emits scalars", async () => {
    const contents = await emitTypeSpecToTs(
      `
      scalar X extends string;
      scalar Y extends int32;
      
      model Foo {
        x: X;
        y: Y;
      }
      `
    );

    /*
    export const FooSchema = z.object({
      x: z.string(),
      y: z.number(),
    });
    */
    assert.match(contents, /export const FooSchema = z.object\(/);
    assert.match(contents, /x: z.string\(\)/);
    assert.match(contents, /y: z.number\(\)/);
  });

  it("emits models to a single file", async () => {
    const host = await getHostForTypeSpecFile(testCode);
    const emitter = createAssetEmitter(host.program, SingleFileTestEmitter, {
      emitterOutputDir: host.program.compilerOptions.outputDir!,
      options: {},
    } as any);

    emitter.emitProgram();
    await emitter.writeOutput();

    const files = await host.program.host.readDir("./tsp-output");
    assert.strictEqual(files.length, 1);
    const contents = (
      await host.program.host.readFile("./tsp-output/output.ts")
    ).text;
    // some light assertions
    assert.match(contents, /export const BasicSchema/);
    assert.match(contents, /export const HasRefSchema/);
  });

  it("emits to multiple files", async () => {
    const host = await getHostForTypeSpecFile(testCode);

    class ClassPerFileEmitter extends ZodEmitter {
      modelDeclarationContext(model: Model): Context {
        return this.#declarationContext(model);
      }

      modelInstantiationContext(model: Model): Context {
        return this.#declarationContext(model);
      }

      unionDeclarationContext(union: Union): Context {
        return this.#declarationContext(union);
      }

      unionInstantiationContext(union: Union): Context {
        return this.#declarationContext(union);
      }

      enumDeclarationContext(en: Enum): Context {
        return this.#declarationContext(en);
      }

      arrayDeclarationContext(array: Model): Context {
        return this.#declarationContext(array);
      }

      interfaceDeclarationContext(iface: Interface): Context {
        return this.#declarationContext(iface);
      }

      operationDeclarationContext(operation: Operation): Context {
        return this.#declarationContext(operation);
      }

      #declarationContext(decl: TypeSpecDeclaration) {
        const name = this.emitter.emitDeclarationName(decl);
        const outputFile = this.emitter.createSourceFile(`${name}.ts`);

        return { scope: outputFile.globalScope };
      }
    }
    const emitter = createAssetEmitter(host.program, ClassPerFileEmitter, {
      emitterOutputDir: host.program.compilerOptions.outputDir!,
      options: {},
    } as any);

    emitter.emitProgram();

    await emitter.writeOutput();

    const files = new Set(await host.program.host.readDir("./tsp-output"));
    [
      "Basic.ts",
      "RefsOtherModel.ts",
      "HasNestedLiteral.ts",
      "HasArrayProperty.ts",
      "IsArray.ts",
      "Derived.ts",
      "HasDoc.ts",
      "HasTemplates.ts",
      "TemplateBasic.ts",
      "IsTemplate.ts",
      "HasRef.ts",
      "SomeOp.ts",
      "MyEnum.ts",
      "UnionDecl.ts",
      "MyInterface.ts",
    ].forEach((file) => {
      assert(files.has(file), `emits ${file}`);
    });
  });

  it("emits to namespaces", async () => {
    const host = await getHostForTypeSpecFile(testCode);

    class NamespacedEmitter extends ZodEmitter {
      private nsByName: Map<string, Scope<string>> = new Map();
      programContext(): Context {
        const outputFile = emitter.createSourceFile("output.ts");
        return {
          scope: outputFile.globalScope,
        };
      }

      modelDeclarationContext(model: Model): Context {
        const name = this.emitter.emitDeclarationName(model);
        if (!name) return {};
        const nsName = name.slice(0, 1);
        let nsScope = this.nsByName.get(nsName);
        if (!nsScope) {
          nsScope = this.emitter.createScope(
            {},
            nsName,
            this.emitter.getContext().scope
          );
          this.nsByName.set(nsName, nsScope);
        }

        return {
          scope: nsScope,
        };
      }

      async sourceFile(
        sourceFile: SourceFile<string>
      ): Promise<EmittedSourceFile> {
        const emittedSourceFile = await super.sourceFile(sourceFile);
        emittedSourceFile.contents += emitNamespaces(sourceFile.globalScope);
        emittedSourceFile.contents = await prettier.format(
          emittedSourceFile.contents,
          {
            parser: "typescript",
          }
        );
        return emittedSourceFile;

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
            ns += decl.value + ",\n";
          }
          ns += `}\n`;

          return ns;
        }
      }
    }
    const emitter = createAssetEmitter(host.program, NamespacedEmitter, {
      emitterOutputDir: host.program.compilerOptions.outputDir!,
      options: {},
    } as any);
    emitter.emitProgram();
    await emitter.writeOutput();
    const contents = (await host.compilerHost.readFile("tsp-output/output.ts"))
      .text;

    assert.match(contents, /export namespace B \{/);
    assert.match(contents, /export namespace R \{/);
    assert.match(contents, /export namespace H \{/);
    assert.match(contents, /export namespace I \{/);
    assert.match(contents, /export namespace D \{/);
    assert.match(contents, /y: B\.BasicSchema/);
    assert.match(contents, /prop: B\.BasicSchema/);
  });

  it("handles circular references", async () => {
    const host = await getHostForTypeSpecFile(`
      model Foo { prop: Baz }
      model Baz { prop: Foo }
    `);

    const emitter: AssetEmitter<string> = createAssetEmitter(
      host.program,
      SingleFileZodEmitter,
      {
        emitterOutputDir: host.program.compilerOptions.outputDir!,
        options: {},
      } as any
    );
    emitter.emitProgram();
    await emitter.writeOutput();
    const contents = (await host.compilerHost.readFile("tsp-output/output.ts"))
      .text;
    assert.match(contents, /prop: Foo/);
    assert.match(contents, /prop: Baz/);
  });
});
