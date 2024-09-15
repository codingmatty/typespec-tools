import { Model } from "@typespec/compiler";
import {
  Context,
  EmitterOutput,
  createAssetEmitter,
} from "@typespec/compiler/emitter-framework";
import assert from "assert";
import { beforeAll, describe, it } from "vitest";

import { SingleFileExpressEmitter } from "../src/emitter.js";
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
        /export type listPetsResponseBody = { pets: PetStore.Pet\[\] };/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type listPetsHandler = express.RequestHandler<\n\s+listPetsParams,\n\s+listPetsResponseBody,\n\s+listPetsBody,\n\s+listPetsQuery\n\s+>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface PetsHandlers \{(\n|.)*listPets: \(\.\.\.handlers: Array<Pets.listPetsHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const listPets: PetsHandlers\["listPets"\] = \(\.\.\.handlers\) => \{[\n\s]*router.get\("\/pets", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*listPets,(\n|.)*\};/);
    });
  });

  describe("get route", async () => {
    it("emits the function types", () => {
      assert.match(contents, /export type getPetParams = \{ petId: number \};/);
      assert.match(contents, /export type getPetQuery = \{\};/);
      assert.match(contents, /export type getPetBody = undefined;/);
      assert.match(
        contents,
        /export type getPetResponseBody =(\n|.)*\| \{ pet: PetStore.Pet \}(\n|.)*\| \{ error: PetStore.NotFoundError \};/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type getPetHandler = express.RequestHandler<\n\s+getPetParams,\n\s+getPetResponseBody,\n\s+getPetBody,\n\s+getPetQuery\n\s+>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface PetsHandlers \{(\n|.)*getPet: \(\.\.\.handlers: Array<Pets.getPetHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const getPet: PetsHandlers\["getPet"\] = \(\.\.\.handlers\) => \{[\n\s]*router.get\("\/pets\/:petId", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*getPet,(\n|.)*\};/);
    });
  });

  describe("create route", async () => {
    it("emits the function types", () => {
      assert.match(contents, /export type createPetParams = \{\};/);
      assert.match(contents, /export type createPetQuery = \{\};/);
      assert.match(contents, /export type createPetBody = PetStore.Pet;/);
      assert.match(
        contents,
        /export type createPetResponseBody = \{ pet: PetStore.Pet \};/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type createPetHandler = express.RequestHandler<\n\s+createPetParams,\n\s+createPetResponseBody,\n\s+createPetBody,\n\s+createPetQuery\n\s+>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface PetsHandlers \{(\n|.)*createPet: \(\.\.\.handlers: Array<Pets.createPetHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const createPet: PetsHandlers\["createPet"\] = \(\.\.\.handlers\) => \{[\n\s]*router.post\("\/pets", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*createPet,(\n|.)*\};/);
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
        /export type updatePetBody = \{\n\s+id: number;\n\s+name: string;\n\s+age: number;\n\s+kind: petType;\n\s+\};/
      );
      assert.match(
        contents,
        /export type updatePetResponseBody =(\n|.)*\| \{ pet: PetStore.Pet \}(\n|.)*\| \{ error: PetStore.NotFoundError \};/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export type updatePetHandler = express.RequestHandler<\n\s+updatePetParams,\n\s+updatePetResponseBody,\n\s+updatePetBody,\n\s+updatePetQuery\n\s+>;/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface PetsHandlers \{(\n|.)*updatePet: \(\.\.\.handlers: Array<Pets.updatePetHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const updatePet: PetsHandlers\["updatePet"\] = \(\.\.\.handlers\) => \{[\n\s]*router.put\("\/pets\/:petId", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*updatePet,(\n|.)*\};/);
    });
  });

  describe('second namespace, "Animals"', async () => {
    it("emits the function types", () => {
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsParams = \{\};(\n|.)*\}/
      );
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsQuery = { type\?: petType };(\n|.)*\}/
      );
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsBody = undefined;(\n|.)*\}/
      );
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsResponseBody = { pets: PetStore.Pet\[\] };(\n|.)*\}/
      );
    });

    it("emits the handler type", () => {
      assert.match(
        contents,
        /export namespace Animals \{(\n|.)*export type listPetsHandler = express.RequestHandler<\n\s+listPetsParams,\n\s+listPetsResponseBody,\n\s+listPetsBody,\n\s+listPetsQuery\n\s+>;(\n|.)*\}/
      );
    });

    it("emits the route callback type", () => {
      assert.match(
        contents,
        /export interface AnimalsHandlers \{(\n|.)*listPets: \(\.\.\.handlers: Array<Animals.listPetsHandler>\) => void;(\n|.)*\}/
      );
    });

    it("emits the route callback implementation", () => {
      assert.match(
        contents,
        /const listPets: AnimalsHandlers\["listPets"\] = \(\.\.\.handlers\) => \{[\n\s]*router.get\("\/animals", \.\.\.handlers\);(\n|.)*\};/
      );
      assert.match(contents, /return \{(\n|.)*listPets,(\n|.)*\};/);
    });

    it('emits the "Animals" namespace in the TypedRouter', () => {
      assert.match(
        contents,
        /export interface TypedRouter \{(\n|.)*Animals: AnimalsHandlers;(\n|.)*\}/
      );
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
});
