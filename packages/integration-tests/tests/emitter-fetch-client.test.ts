import express from "express";
import { assert, beforeAll, describe, expect, it } from "vitest";

import {
  createTypedClient,
  PetStore,
  TypedClient,
} from "../tsp-output/@typespec-tools/emitter-fetch-client/output";
import bodyParser = require("body-parser");

const pets: PetStore.Pet[] = [
  { id: 1, name: "Fluffy", age: 3, kind: PetStore.petType.dog },
  { id: 2, name: "Rex", age: 8, kind: PetStore.petType.cat },
  { id: 3, name: "Charlie", age: 10, kind: PetStore.petType.bird },
  { id: 4, name: "Bella", age: 2, kind: PetStore.petType.fish },
  { id: 5, name: "Max", age: 4, kind: PetStore.petType.dog },
  { id: 6, name: "Lucy", age: 5, kind: PetStore.petType.cat },
  { id: 7, name: "Tucker", age: 1, kind: PetStore.petType.reptile },
];

function startServer() {
  const app = express();
  app.use(bodyParser.json());

  app.get("/pets", (req, res) => {
    const filteredPets = pets.filter((pet) => {
      return !req.query.type || pet.kind === req.query.type;
    });
    res.json({ pets: filteredPets });
  });
  app.get("/pets/:petId", (req, res) => {
    const pet = pets.find((pet) => {
      return pet.id.toString() === req.params.petId;
    });

    return pet
      ? res.json({ pet })
      : res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Pet not found" } });
  });
  app.post("/pets", (req, res) => {
    const pet: PetStore.Pet = req.body;
    // pets.push(pet);
    res.json({ pet });
  });
  app.put("/pets/:petId", (req, res) => {
    const pet = pets.find((pet) => {
      return pet.id.toString() === req.params.petId;
    });

    if (!pet) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Pet not found" } });
    }

    const updatedPet = Object.assign(pet, req.body);
    res.json({ pet: updatedPet });
  });
  app.delete("/pets/:petId", (req, res) => {
    const tempPets = [...pets];
    const index = tempPets.findIndex((pet) => {
      return pet.id.toString() === req.params.petId;
    });

    if (index === -1) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Pet not found" } });
    }

    const pet = tempPets.splice(index, 1)[0]!;
    res.json({ pet });
  });
  app.get("/pets/type/:petType", (req, res) => {
    const filteredPets = pets.filter((pet) => {
      return pet.kind === req.params.petType;
    });
    res.json({ pets: filteredPets });
  });

  app.use((req, res) => res.status(404).send("Not Found"));
  app.listen(3457);
}

describe("emitter-express", () => {
  let client: TypedClient;
  beforeAll(() => {
    startServer();
    client = createTypedClient("http://localhost:3457");
  });

  // it("should throw an error", async () => {
  //   const res = await fetch("http://localhost:3456/test");
  //   expect(res.status).toBe(404);
  // });

  describe('GET "/pets"', () => {
    it("should return the list of pets", async () => {
      const { data } = await client.PetStorePets.listPets();
      expect(data).toMatchObject({ pets });
    });

    it("should return a list of pets for specific type", async () => {
      const { data } = await client.PetStorePets.listPets({
        query: { type: PetStore.petType.dog },
      });
      expect(data.pets).toHaveLength(2);
    });
  });

  describe('GET "/pets/:id"', () => {
    it("should return the pet", async () => {
      const { data } = await client.PetStorePets.getPet({ petId: "1" });
      expect(data).toMatchObject({ pet: pets[0] });
    });

    it("should return 404", async () => {
      const { statusCode, data } = await client.PetStorePets.getPet({
        petId: "100",
      });
      assert(statusCode === 404);
      expect(data.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Pet not found",
      });
    });
  });

  describe('POST "/pets"', () => {
    it("should return the created pet", async () => {
      const { data } = await client.PetStorePets.createPet({
        body: {
          id: 8,
          name: "Daisy",
          age: 6,
          kind: PetStore.petType.cat,
        },
      });
      expect(data.pet).toMatchObject({
        id: 8,
        name: "Daisy",
        age: 6,
        kind: PetStore.petType.cat,
      });
    });
  });

  describe('PUT "/pets/:id"', () => {
    it("should return the updated pet", async () => {
      const { data } = await client.PetStorePets.updatePet({
        petId: "1",
        body: { name: "Fluffy Jr." },
      });
      expect(data).toMatchObject({ pet: { ...pets[0], name: "Fluffy Jr." } });
    });

    it("should return 404", async () => {
      const { statusCode, data } = await client.PetStorePets.updatePet({
        petId: "100",
        body: { name: "Fluffy Jr." },
      });
      assert(statusCode === 404);
      expect(data.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Pet not found",
      });
    });
  });

  describe('DELETE "/pets/:id"', () => {
    it("should return the deleted pet", async () => {
      const { statusCode, data } = await client.PetStorePets.deletePet({
        petId: "1",
      });
      assert(statusCode === 200);
      expect(data.pet).toMatchObject(pets[0]!);
    });

    it("should return 404", async () => {
      const { statusCode, data } = await client.PetStorePets.deletePet({
        petId: "100",
      });
      assert(statusCode === 404);
      expect(data.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Pet not found",
      });
    });
  });

  describe("ByType", () => {
    describe('GET "/pets/type/:type"', () => {
      it("should return the list of pets", async () => {
        const { data } = await client.PetStorePets.ByType.listPets({
          petType: PetStore.petType.dog,
        });
        expect(data).toMatchObject({ pets: [pets[0], pets[4]] });
      });

      it("should return an empty list", async () => {
        const { data } = await client.PetStorePets.ByType.listPets({
          // @ts-expect-error testing invalid type
          petType: "zebra",
        });
        expect(data).toMatchObject({ pets: [] });
      });
    });
  });
});
