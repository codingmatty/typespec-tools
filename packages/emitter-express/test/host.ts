import { createAssetEmitter } from "@typespec/compiler/emitter-framework";
import { createTestHost } from "@typespec/compiler/testing";
import { HttpTestLibrary } from "@typespec/http/testing";

export async function getHostForTypeSpecFile(
  contents: string,
  decorators?: Record<string, any>
) {
  const host = await createTestHost({
    libraries: [HttpTestLibrary]
  });
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

export async function emitTypeSpec(Emitter: any, code: string) {
  const host = await getHostForTypeSpecFile(code);
  const emitter = createAssetEmitter(host.program, Emitter, {
    emitterOutputDir: "tsp-output",
    options: {
      fileName: "testing.ts",
    },
  } as any);

  emitter.emitProgram();
  await emitter.writeOutput();

  return emitter;
}
