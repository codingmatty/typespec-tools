# @typespec-tools/emitter-express

TypeSpec library for emitting a helper function to build type-safe Express routes a [TypeSpec](https://typespec.io) DSL using the [@typespec/http](https://typespec.io/docs/libraries/http/reference) library.

---

> [!WARNING]
> This library uses the current [emitter-framework](https://typespec.io/docs/extending-typespec/emitter-framework) that is set to be updated, which could cause breaking changes.

**Disclaimer:** Please note that this library is not officially affiliated with TypeSpec or Azure. It is an independent project started by @codingmatty.

## Features / Roadmap

- [x] Emit a function that can build type-safe Express routes
- [ ] Add support for typed responses based on status codes
- [ ] Add support for header types
- [ ] Add support for authorization
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

TODO

### Emitter options

| Option        | Type   | Default     | Description             |
| ------------- | ------ | ----------- | ----------------------- |
| `output-file` | string | "output.ts" | Name of the output file |
