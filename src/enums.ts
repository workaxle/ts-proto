import { code, def, Code, joinCode } from 'ts-poet';
import { EnumDescriptorProto } from 'ts-proto-descriptors';
import { maybeAddComment } from './utils';
import { camelCase, camelToSnake } from './case';
import SourceInfo, { Fields } from './sourceInfo';
import { Context } from './context';

const UNRECOGNIZED_ENUM_NAME = 'UNRECOGNIZED';
const UNRECOGNIZED_ENUM_VALUE = -1;

// Output the `enum { Foo, A = 0, B = 1 }`
export function generateEnum(
  ctx: Context,
  fullName: string,
  enumDesc: EnumDescriptorProto,
  sourceInfo: SourceInfo
): Code {
  const { options } = ctx;
  const chunks: Code[] = [];

  maybeAddComment(sourceInfo, chunks, enumDesc.options?.deprecated);

  if (options.enumsAsLiterals) {
    chunks.push(code`export const ${def(fullName)} = {`);
  } else {
    chunks.push(code`export ${options.constEnums ? 'const ' : ''}enum ${def(fullName)} {`);
  }

  const delimiter = options.enumsAsLiterals ? ':' : '=';

  enumDesc.value.forEach((valueDesc, index) => {
    const info = sourceInfo.lookup(Fields.enum.value, index);
    const valueName = options.removeEnumPrefix
      ? valueDesc.name.replace(`${camelToSnake(fullName)}_`, '')
      : valueDesc.name;
    maybeAddComment(info, chunks, valueDesc.options?.deprecated, `${valueName} - `);
    chunks.push(
      code`${valueName} ${delimiter} ${options.stringEnums ? `"${valueName}"` : valueDesc.number.toString()},`
    );
  });

  if (options.unrecognizedEnum)
    chunks.push(code`
      ${UNRECOGNIZED_ENUM_NAME} ${delimiter} ${
      options.stringEnums ? `"${UNRECOGNIZED_ENUM_NAME}"` : UNRECOGNIZED_ENUM_VALUE.toString()
    },`);

  if (options.enumsAsLiterals) {
    chunks.push(code`} as const`);
    chunks.push(code`\n`);
    chunks.push(code`export type ${def(fullName)} = typeof ${def(fullName)}[keyof typeof ${def(fullName)}]`);
  } else {
    chunks.push(code`}`);
  }

  if (options.outputJsonMethods || (options.stringEnums && options.outputEncodeMethods)) {
    chunks.push(code`\n`);
    chunks.push(generateEnumFromJson(ctx, fullName, enumDesc));
  }
  if (options.outputJsonMethods) {
    chunks.push(code`\n`);
    chunks.push(generateEnumToJson(ctx, fullName, enumDesc));
  }
  if (options.stringEnums && options.outputEncodeMethods) {
    chunks.push(code`\n`);
    chunks.push(generateEnumToNumber(ctx, fullName, enumDesc));
  }

  return joinCode(chunks, { on: '\n' });
}

/** Generates a function with a big switch statement to decode JSON -> our enum. */
export function generateEnumFromJson(ctx: Context, fullName: string, enumDesc: EnumDescriptorProto): Code {
  const { options, utils } = ctx;
  const chunks: Code[] = [];

  const functionName = camelCase(fullName) + 'FromJSON';
  chunks.push(code`export function ${def(functionName)}(object: any): ${fullName} {`);
  chunks.push(code`switch (object) {`);

  for (const valueDesc of enumDesc.value) {
    const valueName = options.removeEnumPrefix
      ? valueDesc.name.replace(`${camelToSnake(fullName)}_`, '')
      : valueDesc.name;
    chunks.push(code`
      case ${valueDesc.number}:
      case "${valueName}":
        return ${fullName}.${valueName};
    `);
  }

  if (options.unrecognizedEnum) {
    chunks.push(code`
      case ${UNRECOGNIZED_ENUM_VALUE}:
      case "${UNRECOGNIZED_ENUM_NAME}":
      default:
        return ${fullName}.${UNRECOGNIZED_ENUM_NAME};
    `);
  } else {
    // We use globalThis to avoid conflicts on protobuf types named `Error`.
    chunks.push(code`
      default:
        throw new ${utils.globalThis}.Error("Unrecognized enum value " + object + " for enum ${fullName}");
    `);
  }

  chunks.push(code`}`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: '\n' });
}

/** Generates a function with a big switch statement to encode our enum -> JSON. */
export function generateEnumToJson(ctx: Context, fullName: string, enumDesc: EnumDescriptorProto): Code {
  const { options } = ctx;
  const chunks: Code[] = [];

  const functionName = camelCase(fullName) + 'ToJSON';
  chunks.push(code`export function ${def(functionName)}(object: ${fullName}): string {`);
  chunks.push(code`switch (object) {`);

  for (const valueDesc of enumDesc.value) {
    const valueName = options.removeEnumPrefix
      ? valueDesc.name.replace(`${camelToSnake(fullName)}_`, '')
      : valueDesc.name;
    chunks.push(code`case ${fullName}.${valueName}: return "${valueName}";`);
  }
  chunks.push(code`default: return "UNKNOWN";`);

  chunks.push(code`}`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: '\n' });
}

/** Generates a function with a big switch statement to encode our string enum -> int value. */
export function generateEnumToNumber(ctx: Context, fullName: string, enumDesc: EnumDescriptorProto): Code {
  const { options } = ctx;
  const chunks: Code[] = [];

  const functionName = camelCase(fullName) + 'ToNumber';
  chunks.push(code`export function ${def(functionName)}(object: ${fullName}): number {`);
  chunks.push(code`switch (object) {`);
  for (const valueDesc of enumDesc.value) {
    const valueName = options.removeEnumPrefix
      ? valueDesc.name.replace(`${camelToSnake(fullName)}_`, '')
      : valueDesc.name;
    chunks.push(code`case ${fullName}.${valueName}: return ${valueDesc.number};`);
  }
  chunks.push(code`default: return 0;`);
  chunks.push(code`}`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: '\n' });
}
