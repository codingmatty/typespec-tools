# @typespec-tools/emitter-typescript

TypeSpec library for emitting Typescript types from the [TypeSpec](https://typespec.io) DSL.

---

> [!WARNING]
> This library uses the current [emitter-framework](https://typespec.io/docs/extending-typespec/emitter-framework) that is set to be updated, which could cause breaking changes.

**Disclaimer:** Please note that this library is not officially affiliated with TypeSpec or Azure. It is an independent project started by @codingmatty.

**Full Disclosure:** This library was created primarily from the [emitter-framework test case](https://github.com/microsoft/typespec/blob/f4c8710673139b1d05cb77717f897b717efa1d7d/packages/compiler/test/emitter-framework/emitter.test.ts) to be able to publish it.

## Features / Roadmap

- [x] Emit basic Typescript types from a TypeSpec file
- [ ] Add support for decorators

## Install

```bash
npm install @typespec-tools/emitter-typescript
```

## Emitter

### Usage

1. Via the command line

```bash
tsp compile . --emit=@typespec-tools/emitter-typescript
```

2. Via the config

```yaml
emit:
  - "@typespec-tools/emitter-typescript"
```

The config can be extended with options as follows:

```yaml
emit:
  - "@typespec-tools/emitter-typescript"
options:
  "@typespec-tools/emitter-typescript":
    option: value
```

### Emitter options

| Option        | Type   | Default     | Description             |
| ------------- | ------ | ----------- | ----------------------- |
| `output-file` | string | "output.ts" | Name of the output file |
