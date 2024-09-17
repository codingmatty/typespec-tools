import { assert, describe, it } from "vitest";
import { z } from "zod";

import { PetStore } from "../tsp-output/@typespec-tools/emitter-zod/output";

const {
  petTypeEnum,
  PetSchema,
  Pets: { getPetSchema, listPetsSchema },
} = PetStore;

const validPet: z.infer<typeof PetSchema> = {
  id: 123,
  name: "Fluffy",
  age: 3,
  kind: petTypeEnum.dog,
};
const invalidPet = {
  ...validPet,
  id: "invalid",
  name: 123,
  kind: "invalid",
};

describe("emitter-zod", () => {
  describe("PetSchema", () => {
    it("validates a valid pet", () => {
      const result = PetSchema.safeParse(validPet);
      assert.isTrue(result.success, result.error?.toString());
    });

    it("invalidates an invalid pet", () => {
      const result = PetSchema.safeParse(invalidPet);
      assert.isFalse(result.success);
      assert.equal(result.error?.errors.length, 3);
    });
  });

  describe("listPetsSchema", () => {
    let response: ReturnType<z.infer<typeof listPetsSchema>>;
    const fn = listPetsSchema.implement(() => response);

    it("validates the args", () => {
      response = { pets: [validPet] };
      assert.doesNotThrow(() => fn(undefined));
    });

    it("validates the response", () => {
      response = { pets: [invalidPet] as any };
      assert.throws(() => fn(undefined));
    });
  });

  describe("getPetSchema", () => {
    let response: ReturnType<z.infer<typeof getPetSchema>>;
    const fn = getPetSchema.implement(() => response);

    describe("impelementation that returns a pet", () => {
      it("validates the args", () => {
        response = { pet: validPet };
        assert.doesNotThrow(() => fn(123));
        assert.throws(() => fn("123" as any));
      });

      it("validates the response", () => {
        response = { pet: invalidPet as any };
        assert.throws(() => fn(123));
      });
    });

    describe("impelementation that returns an error", () => {
      it("validates the args", () => {
        response = { error: { code: "NOT_FOUND", message: "Testing" } };
        assert.doesNotThrow(() => fn(123));
        assert.throws(() => fn("123" as any));
      });

      it("validates the response", () => {
        response = { error: { code: "NOT_FOUND", message: 123 } as any };
        assert.throws(() => fn(123));
      });
    });
  });
});
