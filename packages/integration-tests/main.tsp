import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";

using TypeSpec.Http;

@service({
  title: "Pet Store",
})
@server("https://example.com", "Single server endpoint")
namespace PetStore;

model Pet {
  id: int32;

  @minLength(1)
  name: string;

  @minValue(0)
  @maxValue(100)
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

model SinglePetResponse {
  ...OkResponse;
  @body pet: Pet;
}

model MultiplePetResponse {
  ...OkResponse;
  @body pets: Pet[];
}

model CommonNotFoundResponse {
  ...NotFoundResponse;
  @body error: NotFoundError;
}

@route("/pets")
namespace Pets {
  @get
  op listPets(@query type?: petType): MultiplePetResponse;

  @get
  op getPet(@path petId: int32): SinglePetResponse | CommonNotFoundResponse;

  @post
  op createPet(@body pet: Pet): SinglePetResponse;

  @put
  op updatePet(
    @path petId: int32,
    @body pet: OptionalProperties<Pet>,
  ): SinglePetResponse | CommonNotFoundResponse;

  @delete
  op deletePet(@path petId: int32): SinglePetResponse | CommonNotFoundResponse;

  @route("/type/{petType}")
  namespace ByType {
    @get
    op listPets(@path petType: petType): MultiplePetResponse;
  }
}

@error
model NotFoundError {
  code: "NOT_FOUND";
  message: string;
}
