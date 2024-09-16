import { Model } from "@typespec/compiler";
import {
  AssetEmitter,
  Context,
  EmitterOutput,
  TypeSpecDeclaration,
  createAssetEmitter,
} from "@typespec/compiler/emitter-framework";

import assert from "assert";
import { describe, it } from "vitest";

import {
  SingleFileTypescriptEmitter,
  TypescriptEmitter,
} from "../src/emitter.js";
import { EmitterOptions } from "../src/lib.js";
import { emitTypeSpec, getHostForTypeSpecFile } from "./host.js";

const testCode = `
namespace Root;

model Basic { x: string }
model RefsOtherModel { x: Basic, y: UnionDecl }
model HasNestedLiteral { x: { y: string } }
model HasArrayProperty { x: string[], y: Basic[] }
model IsArray is Array<string>;

namespace WrappedModels {
  model Derived extends Basic { }

  @doc("Has a doc")
  model HasDoc { @doc("an x property") x: string }
}

model Template<T> { prop: T }
model HasTemplates { x: Template<Basic> }
model IsTemplate is Template<Basic>;
model HasRef {
  x: Basic.x;
  y: RefsOtherModel.x;
  z: Operations.SomeOp;
}

namespace Operations {
  op SomeOp(x: string): string;

  interface MyInterface {
    op get(): string;
  }
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

class SingleFileTestEmitter extends SingleFileTypescriptEmitter {
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

describe("emitter-framework: typescript emitter", () => {
  it("emits models", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: {
          y: string;
        },
      }
    `);

    assert.match(contents, /export type A =/);
    assert.match(contents, /x: \{ y: string \}/);
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

    assert.match(contents, /export type Test1 = {/);
    assert.match(contents, /export type TemplateInt32 = {/);
    assert.match(contents, /export type Test2 = {/);
    assert.match(contents, /prop: TemplateInt32/);
  });

  it("emits literal types", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: true,
        y: "hi",
        z: 12
      }
    `);

    assert.match(contents, /x: true/);
    assert.match(contents, /y: "hi"/);
    assert.match(contents, /z: 12/);
  });

  it("emits unknown", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: unknown
      }
    `);

    assert.match(contents, /x: unknown/);
  });

  it("emits never", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: never
      }
    `);

    assert.match(contents, /x: never/);
  });

  it("emits void", async () => {
    const contents = await emitTypeSpecToTs(`
      model A {
        x: void
      }
    `);

    assert.match(contents, /x: void/);
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

    assert.match(contents, /export type MyArray2 = Array<string>/);
    assert.match(contents, /x: MyArray2/);
    assert.match(contents, /y: string\[\]/);
    assert.match(contents, /z: \(string \| number\)\[\]/);
  });

  it("emits arrays of unknown", async () => {
    const contents = await emitTypeSpecToTs(`
      model MyArray2 is Array<unknown>;
    `);

    assert.match(contents, /export type MyArray2 = Array<unknown>/);
  });

  // todo: what to do with optionals not at the end??
  it("emits operations", async () => {
    const contents = await emitTypeSpecToTs(`
      model SomeModel {
        x: string;
      }
      op read(x: string, y: int32, z: { inline: true }, q?: SomeModel): string;
    `);

    assert.match(contents, /export type read = \(/);
    assert.match(contents, /x: string/);
    assert.match(contents, /y: number/);
    assert.match(contents, /z: { inline: true }/);
    assert.match(contents, /q?: SomeModel/);
    assert.match(contents, /\) => string/);
    assert.match(contents, /export type readParams = Parameters<read>;/);
    assert.match(contents, /export type readReturnType = ReturnType<read>;/);
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

    assert.match(contents, /export type Things =/);
    assert.match(contents, /read\(x: string\): string/);
    assert.match(contents, /write\(y: Foo\): Foo/);
    assert.match(contents, /callCb\(cb: Callback\): string/);
    assert.match(contents, /export type TemplateThings =/);
    assert.match(contents, /read\(\): string/);
    assert.match(contents, /write\(\): string/);
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

    assert.match(contents, /a: 1 \| 2 \| SomeModel/);
    assert.match(contents, /b: TUString/);
    assert.match(contents, /export type U = 1 \| "hello" \| SomeModel/);
    assert.match(contents, /export type TUString = string \| null/);
  });

  it("emits tuple types", async () => {
    const contents = await emitTypeSpecToTs(`
      model Foo {
        x: [string, int32];
      }
    `);

    assert.match(contents, /x: \[string, number\]/);
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
    assert.match(contents, /prop3: MyEnum/);
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

    assert.match(contents, /export type X = string;/);
    assert.match(contents, /export type Y = number;/);
    assert.match(contents, /export type Foo = {/);
    assert.match(contents, /x: X;/);
    assert.match(contents, /y: Y;/);
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
    assert.match(contents, /export type Basic =/);
    assert.match(contents, /export type HasRef =/);
  });

  it("emits to multiple files", async () => {
    const host = await getHostForTypeSpecFile(testCode);

    class ClassPerFileEmitter extends TypescriptEmitter {
      declarationContext(decl: TypeSpecDeclaration) {
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
    const contents = await emitTypeSpecToTs(testCode);
    assert.match(contents, /namespace Root/);
    assert.match(contents, /namespace Operations/);
    assert.match(contents, /namespace WrappedModels/);
    assert.match(contents, /Operations\.SomeOp/);
  });

  it("handles circular references", async () => {
    const host = await getHostForTypeSpecFile(`
      model Foo { prop: Baz }
      model Baz { prop: Foo }
    `);

    const emitter: AssetEmitter<string, EmitterOptions> = createAssetEmitter(
      host.program,
      SingleFileTypescriptEmitter,
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
