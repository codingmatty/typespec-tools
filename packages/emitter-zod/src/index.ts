import { EmitContext } from "@typespec/compiler";
import { createAssetEmitter } from "@typespec/compiler/emitter-framework";
import { SingleFileZodEmitter } from "./emitter.js";

export async function $onEmit(context: EmitContext) {
  const assetEmitter = createAssetEmitter(
    context.program,
    SingleFileZodEmitter,
    context
  );

  // emit my entire TypeSpec program
  assetEmitter.emitProgram();

  // lastly, write your emit output into the output directory
  await assetEmitter.writeOutput();
}
