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
import { beforeAll, beforeEach, describe, it } from "vitest";

import { SingleFileExpressEmitter, ExpressEmitter } from "../src/emitter.js";
import { EmitterOptions } from "../src/lib.js";
import { emitTypeSpec, getHostForTypeSpecFile } from "./host.js";

const testCode = `
import "@typespec/http";

using TypeSpec.Http;

@service({
  title: "Pet Store",
})
@server("https://example.com", "Single server endpoint")
namespace PetStore;

model Pet {
  id: int32;
  name: string;
  age: int32;
  kind: petType;
}

enum petType {
  dog: "dog",
  cat: "cat",
  fish: "fish",
  bird: "bird",
  reptile: "reptile",
}

@route("/pets")
namespace Pets {
  @get
  op listPets(@query type?: petType): {
    @body pets: Pet[];
  };

  @get
  op getPet(@path petId: int32): {
    @body pet: Pet;
  } | {
    @body error: NotFoundError;
  };

  @post
  op addPet(@body pet: Pet): void;

  @put
  op updatePet(
    @path petId: int32,
    ...Pet
  ): Pet;
}

@error
model NotFoundError {
  code: "NOT_FOUND";
  message: string;
}
`;

class SingleFileTestEmitter extends SingleFileExpressEmitter {
  programContext(): Context {
    const outputFile = this.emitter.createSourceFile("output.ts");
    return { scope: outputFile.globalScope };
  }

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

describe("emitter-express", () => {
  let contents: string;

  beforeAll(async () => {
    contents = await emitTypeSpecToTs(testCode);
  });

  it("emits the exported type router type", () => {
    assert.match(
      contents,
      /export interface TypedRouter \{[\n\s]*router: express.Router;(\n|.)*\}/
    );
  });

  it("emits the exported type router generator function", () => {
    assert.match(
      contents,
      /export function createTypedRouter\(router: express.Router\): TypedRouter {/
    );
  });

  describe("list route", async () => {
    it("emits the function types", () => {
      assert.match(contents, /export type listPetsParams = {};/);
      assert.match(
        contents,
        /export type listPetsQuery = { type\?: petType };/
      );
      assert.match(contents, /export type listPetsBody = undefined;/);
      assert.match(
        contents,
        /export type listPetsResponseBody = { pets: Pet\[\] };/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type listPetsHandler = express.RequestHandler<\n\s+listPetsParams,\n\s+listPetsResponseBody,\n\s+listPetsBody,\n\s+listPetsQuery\n>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface TypedRouter \{(\n|.)*listPets: \(\.\.\.handlers: Array<listPetsHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const listPets: TypedRouter\["listPets"\] = \(\.\.\.handlers\) => \{[\n\s]*router.get\("\/pets", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*listPets,(\n|.)*\};/);
    });
  });

  describe("get route", async () => {
    it.only("emits the function types", () => {
      assert.match(contents, /export type getPetParams = \{ petId: number \};/);
      assert.match(contents, /export type getPetQuery = \{\};/);
      assert.match(contents, /export type getPetBody = undefined;/);
      assert.match(
        contents,
        /export type getPetResponseBody = \{ pet: Pet \} \| \{ error: NotFoundError \};/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type getPetHandler = express.RequestHandler<\n\s+getPetParams,\n\s+getPetResponseBody,\n\s+getPetBody,\n\s+getPetQuery\n>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface TypedRouter \{(\n|.)*getPet: \(\.\.\.handlers: Array<getPetHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const getPet: TypedRouter\["getPet"\] = \(\.\.\.handlers\) => \{[\n\s]*router.get\("\/pets\/\{petId\}", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*getPet,(\n|.)*\};/);
    });
  });

  describe("add route", async () => {
    it("emits the function types", () => {
      assert.match(contents, /export type addPetParams = \{\};/);
      assert.match(contents, /export type addPetQuery = \{\};/);
      assert.match(contents, /export type addPetBody = Pet;/);
      assert.match(contents, /export type addPetResponseBody = void;/);
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type addPetHandler = express.RequestHandler<\n\s+addPetParams,\n\s+addPetResponseBody,\n\s+addPetBody,\n\s+addPetQuery\n>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface TypedRouter \{(\n|.)*addPet: \(\.\.\.handlers: Array<addPetHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const addPet: TypedRouter\["addPet"\] = \(\.\.\.handlers\) => \{[\n\s]*router.post\("\/pets", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*addPet,(\n|.)*\};/);
    });
  });

  describe("update route", async () => {
    it("emits the function types", () => {
      assert.match(
        contents,
        /export type updatePetParams = \{ petId: number \};/
      );
      assert.match(contents, /export type updatePetQuery = \{\};/);
      assert.match(
        contents,
        /export type updatePetBody = \{\n\s+id: number;\n\s+name: string;\n\s+age: number;\n\s+kind: petType;\n\};/
      );
      assert.match(contents, /export type updatePetResponseBody = Pet;/);
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type updatePetHandler = express.RequestHandler<\n\s+updatePetParams,\n\s+updatePetResponseBody,\n\s+updatePetBody,\n\s+updatePetQuery\n>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface TypedRouter \{(\n|.)*updatePet: \(\.\.\.handlers: Array<updatePetHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const updatePet: TypedRouter\["updatePet"\] = \(\.\.\.handlers\) => \{[\n\s]*router.put\("\/pets\/\{petId\}", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*updatePet,(\n|.)*\};/);
    });
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
    assert.match(contents, /export interface TypedRouter/);
    assert.match(contents, /export function createTypedRouter/);
  });

  // it("emits to multiple files", async () => {
  //   const host = await getHostForTypeSpecFile(testCode);

  //   class ClassPerFileEmitter extends ExpressEmitter {
  //     modelDeclarationContext(model: Model): Context {
  //       return this.#declarationContext(model);
  //     }

  //     modelInstantiationContext(model: Model): Context {
  //       return this.#declarationContext(model);
  //     }

  //     unionDeclarationContext(union: Union): Context {
  //       return this.#declarationContext(union);
  //     }

  //     unionInstantiationContext(union: Union): Context {
  //       return this.#declarationContext(union);
  //     }

  //     enumDeclarationContext(en: Enum): Context {
  //       return this.#declarationContext(en);
  //     }

  //     arrayDeclarationContext(array: Model): Context {
  //       return this.#declarationContext(array);
  //     }

  //     interfaceDeclarationContext(iface: Interface): Context {
  //       return this.#declarationContext(iface);
  //     }

  //     operationDeclarationContext(operation: Operation): Context {
  //       return this.#declarationContext(operation);
  //     }

  //     #declarationContext(decl: TypeSpecDeclaration) {
  //       const name = this.emitter.emitDeclarationName(decl);
  //       const outputFile = this.emitter.createSourceFile(`${name}.ts`);

  //       return { scope: outputFile.globalScope };
  //     }
  //   }
  //   const emitter = createAssetEmitter(host.program, ClassPerFileEmitter, {
  //     emitterOutputDir: host.program.compilerOptions.outputDir!,
  //     options: {},
  //   } as any);

  //   emitter.emitProgram();

  //   await emitter.writeOutput();

  //   const files = new Set(await host.program.host.readDir("./tsp-output"));
  //   [
  //     "Basic.ts",
  //     "RefsOtherModel.ts",
  //     "HasNestedLiteral.ts",
  //     "HasArrayProperty.ts",
  //     "IsArray.ts",
  //     "Derived.ts",
  //     "HasDoc.ts",
  //     "HasTemplates.ts",
  //     "TemplateBasic.ts",
  //     "IsTemplate.ts",
  //     "HasRef.ts",
  //     "SomeOp.ts",
  //     "MyEnum.ts",
  //     "UnionDecl.ts",
  //     "MyInterface.ts",
  //   ].forEach((file) => {
  //     assert(files.has(file), `emits ${file}`);
  //   });
  // });

  // it("emits to namespaces", async () => {
  //   const host = await getHostForTypeSpecFile(testCode);

  //   class NamespacedEmitter extends SingleFileExpressEmitter {
  //     private nsByName: Map<string, Scope<string>> = new Map();

  //     modelDeclarationContext(model: Model): Context {
  //       const name = this.emitter.emitDeclarationName(model);
  //       if (!name) return {};
  //       const nsName = name.slice(0, 1);
  //       let nsScope = this.nsByName.get(nsName);
  //       if (!nsScope) {
  //         nsScope = this.emitter.createScope(
  //           {},
  //           nsName,
  //           this.emitter.getContext().scope
  //         );
  //         this.nsByName.set(nsName, nsScope);
  //       }

  //       return {
  //         scope: nsScope,
  //       };
  //     }

  //     async sourceFile(
  //       sourceFile: SourceFile<string>
  //     ): Promise<EmittedSourceFile> {
  //       const emittedSourceFile = await super.sourceFile(sourceFile);
  //       emittedSourceFile.contents += emitNamespaces(sourceFile.globalScope);
  //       emittedSourceFile.contents = await prettier.format(
  //         emittedSourceFile.contents,
  //         {
  //           parser: "typescript",
  //         }
  //       );
  //       return emittedSourceFile;

  //       function emitNamespaces(scope: Scope<string>) {
  //         let res = "";
  //         for (const childScope of scope.childScopes) {
  //           res += emitNamespace(childScope);
  //         }
  //         return res;
  //       }
  //       function emitNamespace(scope: Scope<string>) {
  //         let ns = `namespace ${scope.name} {\n`;
  //         ns += emitNamespaces(scope);
  //         for (const decl of scope.declarations) {
  //           ns += decl.value + "\n";
  //         }
  //         ns += `}\n`;

  //         return ns;
  //       }
  //     }
  //   }
  //   const emitter = createAssetEmitter(host.program, NamespacedEmitter, {
  //     emitterOutputDir: host.program.compilerOptions.outputDir!,
  //     options: {},
  //   } as any);
  //   emitter.emitProgram();
  //   await emitter.writeOutput();
  //   const contents = (await host.compilerHost.readFile("tsp-output/output.ts"))
  //     .text;
  //   assert.match(contents, /namespace B/);
  //   assert.match(contents, /namespace R/);
  //   assert.match(contents, /namespace H/);
  //   assert.match(contents, /namespace I/);
  //   assert.match(contents, /namespace D/);
  //   assert.match(contents, /B\.Basic/);
  //   assert.match(contents, /B\.Basic/);
  // });
});
