# @typespec-tools/emitter-zod

TypeSpec library for emitting Zod Schemas from the [TypeSpec](https://typespec.io) DSL.

---

> [!WARNING]
> This library uses the current [emitter-framework](https://typespec.io/docs/extending-typespec/emitter-framework) that is set to be updated, which could cause breaking changes.

**Disclaimer:** Please note that this library is not officially affiliated with TypeSpec or Azure. It is an independent project started by @codingmatty.

## Features / Roadmap

- [x] Emit basic Zod schemas from a TypeSpec file
- [ ] Add options to configure emitter
- [ ] Add support for built-in decorators
- [ ] Add decorators to cover more cases specific to Zod

## Install

```bash
npm install @typespec-tools/emitter-zod
```

## Emitter

### Usage

1. Via the command line

```bash
tsp compile . --emit=@typespec-tools/emitter-zod
```

2. Via the config

```yaml
emit:
  - "@typespec-tools/emitter-zod"
```

The config can be extended with options as follows:

```yaml
emit:
  - "@typespec-tools/emitter-zod"
options:
  "@typespec-tools/emitter-zod":
    option: value
```

### Emitter options

| Option        | Type   | Default     | Description             |
| ------------- | ------ | ----------- | ----------------------- |
| `output-file` | string | "output.ts" | Name of the output file |
