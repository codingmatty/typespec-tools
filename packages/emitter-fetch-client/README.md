# @typespec-tools/emitter-fetch-client

TypeSpec library for emitting a type-safe Fetch client based on routes from a [TypeSpec](https://typespec.io) DSL using the [@typespec/http](https://typespec.io/docs/libraries/http/reference) library.

---

> [!WARNING]
> This library uses the current [emitter-framework](https://typespec.io/docs/extending-typespec/emitter-framework) that is set to be updated, which could cause breaking changes.

**Disclaimer:** Please note that this library is not officially affiliated with TypeSpec or Azure. It is an independent project started by @codingmatty.

## Features / Roadmap

- [x] Emit a function that can build a type-safe Fetch client
- [ ] Add support for typed responses based on status codes
- [ ] Add support for authorization
- [ ] Add support for header types
- [ ] Add support for Zod schema validation of inputs: Path, Query, Body.
- [ ] Add support for Zod schema validation of output body

## Install

```bash
npm install @typespec-tools/emitter-fetch-client
```

## Emitter

### Usage

1. Via the command line

```bash
tsp compile . --emit=@typespec-tools/emitter-fetch-client
```

2. Via the config

```yaml
emit:
  - "@typespec-tools/emitter-fetch-client"
```

The config can be extended with [options](#emitter-options) as follows:

```yaml
emit:
  - "@typespec-tools/emitter-fetch-client"
options:
  "@typespec-tools/emitter-fetch-client":
    option: value
```

### Examples

Given the following Typespec:

```typespec
import "@typespec/http";

enum petType {...}
model Pet {...}

@route("/pets")
namespace Pets {
  @get
  op listPets(@query type?: petType): {
    @body pets: Pet[];
  };
}
```

This emitter will allow you to implement the following:

```typescript
import { createTypedClient } from "tsp-output/@typespec-tools/emitter-fetch-client/output";

const client = createTypedClient("https://www.example.com/api");

const response: { pets: Pet[] } = client.Pets.listPets({
  query: { type: petType.dog },
});
```

Alternatively, you can implement a single namespace:

```typescript
import { createPetsClient } from "tsp-output/@typespec-tools/emitter-fetch-client/output";

const client = createPetsClient("https://www.example.com/api");

const response: { pets: Pet[] } = client.listPets({
  query: { type: petType.dog },
});
```

### Emitter options

| Option        | Type   | Default     | Description             |
| ------------- | ------ | ----------- | ----------------------- |
| `output-file` | string | "output.ts" | Name of the output file |
