import { describe, expectTypeOf, it } from "vitest";
import { PetStore } from "../tsp-output/@typespec-tools/emitter-typescript/output";

const petType = PetStore.petType;
type Pet = PetStore.Pet;
type listPetsParams = PetStore.Pets.listPetsParams;
type listPetsReturnType = PetStore.Pets.listPetsReturnType;
type getPetParams = PetStore.Pets.getPetParams;
type getPetReturnType = PetStore.Pets.getPetReturnType;

describe("emitter-zod", () => {
  describe("PetSchema", () => {
    it("validates a valid pet", () => {
      expectTypeOf({
        id: 123,
        name: "Fluffy",
        age: 3,
        kind: petType.dog,
      }).toEqualTypeOf<Pet>();
    });

    it("invalidates an invalid pet", () => {
      expectTypeOf({
        id: "invalid",
        name: 123,
        kind: "invalid",
      }).not.toEqualTypeOf<Pet>();
    });
  });

  describe("listPetsSchema", () => {
    it("validates a valid function", () => {
      const validFn = (type?: PetStore.petType) => ({
        pets: [{ id: 123, name: "Fluffy", age: 3, kind: petType.dog }],
      });
      expectTypeOf(validFn).parameters.toEqualTypeOf<listPetsParams>();
      expectTypeOf(validFn).returns.toEqualTypeOf<listPetsReturnType>();
    });

    it("validates an invalid function", () => {
      const invalidFn = (x: number) => ({
        pets: [{ id: "invalid", name: 123, kind: "invalid" }],
      });
      expectTypeOf(invalidFn).parameters.not.toEqualTypeOf<listPetsParams>();
      expectTypeOf(invalidFn).returns.not.toEqualTypeOf<listPetsReturnType>();
    });
  });

  describe("getPetSchema", () => {
    describe("impelementation that returns a pet", () => {
      it("validates a valid function", () => {
        const validFn = (x: number) => ({
          pet: { id: 123, name: "Fluffy", age: 3, kind: petType.dog },
        });
        expectTypeOf(validFn).parameters.toEqualTypeOf<getPetParams>();
        expectTypeOf(validFn).returns.toEqualTypeOf<
          Extract<getPetReturnType, { pet: any }>
        >();
      });

      it("validates an invalid function", () => {
        const invalidFn = () => ({
          pet: { id: "invalid", name: 123, kind: "invalid" },
        });
        expectTypeOf(invalidFn).parameters.not.toEqualTypeOf<getPetParams>();
        expectTypeOf(invalidFn).returns.not.toEqualTypeOf<getPetReturnType>();
      });
    });

    describe("impelementation that returns an error", () => {
      it("validates a valid function", () => {
        const validFn = (x: number) => ({
          error: { code: "NOT_FOUND" as const, message: "Testing" },
        });
        expectTypeOf(validFn).parameters.toEqualTypeOf<getPetParams>();
        expectTypeOf(validFn).returns.toEqualTypeOf<
          Extract<getPetReturnType, { error: any }>
        >();
      });

      it("validates an invalid function", () => {
        const invalidFn = () => ({
          error: { code: "NOT_FOUND", message: 123 },
        });
        expectTypeOf(invalidFn).parameters.not.toEqualTypeOf<getPetParams>();
        expectTypeOf(invalidFn).returns.not.toEqualTypeOf<getPetReturnType>();
      });
    });
  });
});
