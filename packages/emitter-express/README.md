# @typespec-tools/emitter-express

TypeSpec library for emitting a helper function to build type-safe Express routes a [TypeSpec](https://typespec.io) DSL using the [@typespec/http](https://typespec.io/docs/libraries/http/reference) library.

---

> [!WARNING]
> This library uses the current [emitter-framework](https://typespec.io/docs/extending-typespec/emitter-framework) that is set to be updated, which could cause breaking changes.

**Disclaimer:** Please note that this library is not officially affiliated with TypeSpec or Azure. It is an independent project started by @codingmatty.

## Features / Roadmap

- [x] Emit a function that can build type-safe Express routes
- [ ] Add support for typed responses based on status codes
- [ ] Add support for authorization
- [ ] Add support for header types
- [ ] Add support for Zod schema validation of inputs: Path, Query, Body.
- [ ] Add support for Zod schema validation of output body

## Install

```bash
npm install @typespec-tools/emitter-express
```

## Emitter

### Usage

1. Via the command line

```bash
tsp compile . --emit=@typespec-tools/emitter-express
```

2. Via the config

```yaml
emit:
  - "@typespec-tools/emitter-express"
```

The config can be extended with [options](#emitter-options) as follows:

```yaml
emit:
  - "@typespec-tools/emitter-express"
options:
  "@typespec-tools/emitter-express":
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
import { createTypedRouter } from 'tsp-output/@typespec-tools/emitter-express/output";

const app = express();
const router = express.Router();

typedRouter = createTypedRouter(router);

typedRouter.Pets.listPets((req, res) => {
  // req.query.type is typed as petType enum
  // the response has type: { pets: Pet[] }
  res.json({ pets: [...] });
});

app.use(typedRouter.router);
```

Alternatively, you can implement a single namespace:
```typescript
import { createPetsRouter } from 'tsp-output/@typespec-tools/emitter-express/output";

export const router = express.Router();

typedPetsRouter = createPetsRouter(router);

typedPetsRouter.listPets((req, res) => {
  // req.query.type is typed as petType enum
  // the response has type: { pets: Pet[] }
  res.json({ pets: [...] });
});
```

### Emitter options

| Option        | Type   | Default     | Description             |
| ------------- | ------ | ----------- | ----------------------- |
| `output-file` | string | "output.ts" | Name of the output file |
