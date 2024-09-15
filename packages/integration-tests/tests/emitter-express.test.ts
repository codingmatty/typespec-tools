import express from "express";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createTypedRouter,
  PetStore,
  petType,
  TypedRouter,
  Pets,
} from "../tsp-output/@typespec-tools/emitter-express/output";
import bodyParser = require("body-parser");

let typedRouter: TypedRouter;

function startServer() {
  const app = express();
  const router = express.Router();
  app.use(bodyParser.json());
  typedRouter = createTypedRouter(router);
  app.use(typedRouter.router);
  app.use((req, res) => res.status(404).send("Not Found"));
  app.listen(3456);
}

const pets: PetStore.Pet[] = [
  { id: 1, name: "Fluffy", age: 3, kind: petType.dog },
  { id: 2, name: "Rex", age: 8, kind: petType.cat },
  { id: 3, name: "Charlie", age: 10, kind: petType.bird },
  { id: 4, name: "Bella", age: 2, kind: petType.fish },
  { id: 5, name: "Max", age: 4, kind: petType.dog },
  { id: 6, name: "Lucy", age: 5, kind: petType.cat },
  { id: 7, name: "Tucker", age: 1, kind: petType.reptile },
];

describe("emitter-express", () => {
  beforeAll(() => {
    startServer();
  });

  it("should return 404", async () => {
    const res = await fetch("http://localhost:3456/test");
    expect(res.status).toBe(404);
  });

  describe('GET "/pets"', () => {
    beforeAll(() => {
      typedRouter.Pets.listPets((req, res) => {
        const filteredPets = pets.filter((pet) => {
          return !req.query.type || pet.kind === req.query.type;
        });
        res.json({ pets: filteredPets });
      });
    });

    it("should return 200", async () => {
      const res = await fetch("http://localhost:3456/pets");
      expect(res.status).toBe(200);
    });

    it("should return the list of pets", async () => {
      const res = await fetch("http://localhost:3456/pets");
      const data = await res.json();
      expect(data).toMatchObject({ pets });
    });

    it("should return a list of pets for specific type", async () => {
      const res = await fetch("http://localhost:3456/pets?type=dog");
      const data = (await res.json()) as Extract<
        Pets.listPetsResponseBody,
        { pets: any }
      >;
      expect(data.pets).toHaveLength(2);
    });
  });

  describe('GET "/pets/:id"', () => {
    beforeAll(() => {
      typedRouter.Pets.getPet((req, res) => {
        const pet = pets.find((pet) => {
          return pet.id.toString() === req.params.petId;
        });

        return pet
          ? res.json({ pet })
          : res
              .status(404)
              .json({ error: { code: "NOT_FOUND", message: "Pet not found" } });
      });
    });

    it("should return 200", async () => {
      const res = await fetch("http://localhost:3456/pets/1");
      expect(res.status).toBe(200);
    });

    it("should return the pet", async () => {
      const res = await fetch("http://localhost:3456/pets/1");
      const data = await res.json();
      expect(data).toMatchObject({ pet: pets[0] });
    });

    it("should return 404", async () => {
      const res = await fetch("http://localhost:3456/pets/100");
      const data = await res.json();
      expect(data).toMatchObject({
        error: { code: "NOT_FOUND", message: "Pet not found" },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST "/pets"', () => {
    beforeAll(() => {
      typedRouter.Pets.createPet((req, res) => {
        const pet: PetStore.Pet = req.body;
        // pets.push(pet);
        res.json({ pet });
      });
    });

    it("should return 200", async () => {
      const res = await fetch("http://localhost:3456/pets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 8,
          name: "Daisy",
          age: 6,
          kind: petType.cat,
        }),
      });
      expect(res.status).toBe(200);
    });

    it("should return the created pet", async () => {
      const res = await fetch("http://localhost:3456/pets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 8,
          name: "Daisy",
          age: 6,
          kind: petType.cat,
        }),
      });
      const data = (await res.json()) as Extract<
        Pets.createPetResponseBody,
        { pet: any }
      >;
      expect(data.pet).toMatchObject({
        id: 8,
        name: "Daisy",
        age: 6,
        kind: petType.cat,
      });
    });
  });

  describe('PUT "/pets/:id"', () => {
    beforeAll(() => {
      typedRouter.Pets.updatePet((req, res) => {
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
    });

    it("should return 200", async () => {
      const res = await fetch("http://localhost:3456/pets/1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Fluffy Jr.",
        }),
      });
      expect(res.status).toBe(200);
    });

    it("should return the updated pet", async () => {
      const res = await fetch("http://localhost:3456/pets/1");
      const data = await res.json();
      expect(data).toMatchObject({ pet: { ...pets[0], name: "Fluffy Jr." } });
    });

    it("should return 404", async () => {
      const res = await fetch("http://localhost:3456/pets/100", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Fluffy Jr.",
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE "/pets/:id"', () => {
    beforeAll(() => {
      const tempPets = [...pets];
      typedRouter.Pets.deletePet((req, res) => {
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
    });

    it("should return 200", async () => {
      const res = await fetch("http://localhost:3456/pets/1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
    });

    it("should return the deleted pet", async () => {
      const res = await fetch("http://localhost:3456/pets/1");
      const data = (await res.json()) as Extract<
        Pets.deletePetResponseBody,
        { pet: any }
      >;
      expect(data.pet).toMatchObject(pets[0]!);
    });

    it("should return 404", async () => {
      const res = await fetch("http://localhost:3456/pets/100", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
