import { describe, expectTypeOf, it } from "vitest";
import {
  petType,
  Pet,
  listPets,
  getPet,
} from "../tsp-output/@typespec-tools/emitter-typescript/output";

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
      const validFn = () => ({
        pets: [{ id: 123, name: "Fluffy", age: 3, kind: petType.dog }],
      });
      expectTypeOf(validFn).parameters.toEqualTypeOf<Parameters<listPets>>();
      expectTypeOf(validFn).returns.toEqualTypeOf<ReturnType<listPets>>();
    });

    it("validates an invalid function", () => {
      const invalidFn = (x: number) => ({
        pets: [{ id: "invalid", name: 123, kind: "invalid" }],
      });
      expectTypeOf(invalidFn).parameters.not.toEqualTypeOf<
        Parameters<listPets>
      >();
      expectTypeOf(invalidFn).returns.not.toEqualTypeOf<ReturnType<listPets>>();
    });
  });

  describe("getPetSchema", () => {
    describe("impelementation that returns a pet", () => {
      it("validates a valid function", () => {
        const validFn = (x: number) => ({
          pet: { id: 123, name: "Fluffy", age: 3, kind: petType.dog },
        });
        expectTypeOf(validFn).parameters.toEqualTypeOf<Parameters<getPet>>();
        expectTypeOf(validFn).returns.toEqualTypeOf<
          Extract<ReturnType<getPet>, { pet: any }>
        >();
      });

      it("validates an invalid function", () => {
        const invalidFn = () => ({
          pet: { id: "invalid", name: 123, kind: "invalid" },
        });
        expectTypeOf(invalidFn).parameters.not.toEqualTypeOf<
          Parameters<getPet>
        >();
        expectTypeOf(invalidFn).returns.not.toEqualTypeOf<ReturnType<getPet>>();
      });
    });

    describe("impelementation that returns an error", () => {
      it("validates a valid function", () => {
        const validFn = (x: number) => ({
          error: { code: "NOT_FOUND" as const, message: "Testing" },
        });
        expectTypeOf(validFn).parameters.toEqualTypeOf<Parameters<getPet>>();
        expectTypeOf(validFn).returns.toEqualTypeOf<
          Extract<ReturnType<getPet>, { error: any }>
        >();
      });

      it("validates an invalid function", () => {
        const invalidFn = () => ({
          error: { code: "NOT_FOUND", message: 123 },
        });
        expectTypeOf(invalidFn).parameters.not.toEqualTypeOf<
          Parameters<getPet>
        >();
        expectTypeOf(invalidFn).returns.not.toEqualTypeOf<ReturnType<getPet>>();
      });
    });
  });
});
