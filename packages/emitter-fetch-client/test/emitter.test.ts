import { Model } from "@typespec/compiler";
import {
  Context,
  EmitterOutput,
  createAssetEmitter,
} from "@typespec/compiler/emitter-framework";
import assert from "assert";
import { beforeAll, describe, it } from "vitest";

import { FetchClientEmitter } from "../src/emitter.js";
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
  op createPet(@body pet: Pet): {
    @body pet: Pet;
  };

  @put
  op updatePet(@path petId: int32, ...Pet): {
    @body pet: Pet;
  } | {
    @body error: NotFoundError;
  };
}

@route("/animals")
namespace Animals {
  @get
  op listPets(@query type?: petType): {
    @body pets: Pet[];
  };
}

@error
model NotFoundError {
  code: "NOT_FOUND";
  message: string;
}
`;

class SingleFileTestEmitter extends FetchClientEmitter {
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

describe("emitter-fetch-client", () => {
  let contents: string;

  beforeAll(async () => {
    contents = await emitTypeSpecToTs(testCode);
  });

  it("emits the exported type client type", () => {
    assert.match(contents, /export interface TypedClient \{(\n|.)*\}/);
  });

  it("emits the exported type client generator function", () => {
    assert.match(
      contents,
      /export function createTypedClient\(\n\s+baseUrl: string,\n\s+defaultOptions\?: RequestInit,\n\): TypedClient {/
    );
  });

  describe("list route", async () => {
    it("emits the function types", () => {
      assert.match(
        contents,
        /export type listPetsQuery = { type\?: petType };/
      );
      assert.match(
        contents,
        /export type listPetsResponseBody = { pets: Pet\[\] };/
      );
    });

    it("emits the client args", () => {
      assert.match(
        contents,
        /export type listPetsClientArgs = { query: listPetsQuery };/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface Client \{(\n|.)*listPets: \((\n|.)*args: listPetsClientArgs,(\n|.)*options\?: RequestInit,(\n|.)*\) => Promise<listPetsResponseBody>;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const listPets: PetStore.Pets.Client\["listPets"\] = async \(args, options\) => \{(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*listPets,(\n|.)*\};/);
    });
  });

  describe("get route", async () => {
    it("emits the function types", () => {
      assert.match(contents, /export type getPetParams = \{ petId: string \};/);
      assert.match(
        contents,
        /export type getPetResponseBody = \{ pet: Pet \} \| \{ error: NotFoundError \};/
      );
    });

    it("emits the client args", () => {
      assert.match(contents, /export type getPetClientArgs = getPetParams;/);
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface Client \{(\n|.)*getPet: \((\n|.)*args: getPetClientArgs,(\n|.)*options\?: RequestInit,(\n|.)*\) => Promise<getPetResponseBody>;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const getPet: PetStore.Pets.Client\["getPet"\] = async \(args, options\) => \{(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*getPet,(\n|.)*\};/);
    });
  });

  describe("create route", async () => {
    it("emits the function types", () => {
      assert.match(contents, /export type createPetBody = Pet;/);
      assert.match(
        contents,
        /export type createPetResponseBody = \{ pet: Pet \};/
      );
    });

    it("emits the client args", () => {
      assert.match(
        contents,
        /export type createPetClientArgs = { body: createPetBody };/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface Client \{(\n|.)*createPet: \((\n|.)*args: createPetClientArgs,(\n|.)*options\?: RequestInit,(\n|.)*\) => Promise<createPetResponseBody>;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const createPet: PetStore.Pets.Client\["createPet"\] = async \((\n|.)*args,(\n|.)*options(\n|.)*\) => \{(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*createPet,(\n|.)*\};/);
    });
  });

  describe("update route", async () => {
    it("emits the function types", () => {
      assert.match(
        contents,
        /export type updatePetParams = \{ petId: string \};/
      );
      assert.match(
        contents,
        /export type updatePetBody = \{\n\s+id: number;\n\s+name: string;\n\s+age: number;\n\s+kind: petType;\n\s+\};/
      );
      assert.match(
        contents,
        /export type updatePetResponseBody = \{ pet: Pet \} \| \{ error: NotFoundError \};/
      );
    });

    it("emits the client args", () => {
      assert.match(
        contents,
        /export type updatePetClientArgs = updatePetParams & { body: updatePetBody };/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface Client \{(\n|.)*updatePet: \((\n|.)*args: updatePetClientArgs,(\n|.)*options\?: RequestInit,(\n|.)*\) => Promise<updatePetResponseBody>;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const updatePet: PetStore.Pets.Client\["updatePet"\] = async \((\n|.)*args,(\n|.)*options(\n|.)*\) => \{(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*updatePet,(\n|.)*\};/);
    });
  });

  describe('second namespace, "Animals"', async () => {
    it("emits the function types", () => {
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsQuery = { type\?: petType };(\n|.)*\}/
      );
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsResponseBody = { pets: Pet\[\] };(\n|.)*\}/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*listPets: ((\n|.)*args: listPetsClientArgs,(\n|.)*options\?: RequestInit,(\n|.)*) => Promise<listPetsResponseBody>;(\n|.)*\}/
      );
    });

    it("emits the client args", () => {
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsClientArgs = { query: listPetsQuery };/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export interface Client \{(\n|.)*listPets: \((\n|.)*args: listPetsClientArgs,(\n|.)*options\?: RequestInit,(\n|.)*\) => Promise<listPetsResponseBody>;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const listPets: PetStore.Animals.Client\["listPets"\] = async \((\n|.)*args,(\n|.)*options(\n|.)*\) => \{(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*listPets,(\n|.)*\};/);
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
    assert.match(contents, /export interface TypedClient/);
    assert.match(contents, /export function createTypedClient/);
  });

  describe("namespaces", async () => {
    beforeAll(async () => {
      contents = await emitTypeSpecToTs(`
      import "@typespec/http";
      using TypeSpec.Http;

      @server("https://example.com", "Single server endpoint")
      namespace PetStore;

      model Pet {
        id: int32;
        name: string;
        age: int32;
        kind: string;
      }

      @route("/pets")
      namespace Pets {
        @get
        op listPets(@query type?: string): {
          @body pets: Pet[];
        };

        @route("/{type}")
        namespace ByType {
          @get
          op listPets(@path type: string): {
            @body pets: Pet[];
          };

          @route("/{age}")
          namespace ByAge {
            @get
            op listPets(@path type: string, @path age: int32): {
              @body pets: Pet[];
            };
          }
        }
      }
    `);
    });

    it("emits the hierarchy of namespace types", () => {
      assert.match(
        contents,
        /export namespace PetStore \{(\n|.)*export namespace Pets \{(\n|.)*export namespace ByType \{(\n|.)*export namespace ByAge \{(\n|.)*\}(\n|.)*\}(\n|.)*\}(\n|.)*\}/
      );
    });
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
});
