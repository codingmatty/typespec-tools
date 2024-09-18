import { createTypeSpecLibrary, JSONSchemaType } from "@typespec/compiler";

export interface EmitterOptions {
  "output-file"?: string;
  "schema-prefix"?: string;
  "schema-suffix"?: string;
}

const EmitterOptionsSchema: JSONSchemaType<EmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-file": { type: "string", nullable: true },
    "schema-prefix": { type: "string", nullable: true },
    "schema-suffix": { type: "string", nullable: true, default: "Schema" },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@typespec-tools/emitter-zod",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
});
