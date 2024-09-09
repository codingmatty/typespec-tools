import {
  createAssetEmitter,
  TypeEmitter,
} from "@typespec/compiler/emitter-framework";
import { createTestHost } from "@typespec/compiler/testing";

export async function getHostForTypeSpecFile(
  contents: string,
  decorators?: Record<string, any>
) {
  const host = await createTestHost();
  if (decorators) {
    await host.addJsFile("dec.js", decorators);
    contents = `import "./dec.js";\n` + contents;
  }
  await host.addTypeSpecFile("main.tsp", contents);
  await host.compile("main.tsp", {
    outputDir: "tsp-output",
  });
  return host;
}

export async function emitTypeSpec(
  Emitter: typeof TypeEmitter<any>,
  code: string
) {
  const host = await getHostForTypeSpecFile(code);
  const emitter = createAssetEmitter(host.program, Emitter, {
    emitterOutputDir: "tsp-output",
    options: {},
  } as any);

  emitter.emitProgram();
  await emitter.writeOutput();

  return emitter;
}
