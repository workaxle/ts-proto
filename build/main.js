"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextTypeVar = exports.makeUtils = exports.generateFile = void 0;
const ts_poet_1 = require("ts-poet");
const types_1 = require("./types");
const sourceInfo_1 = require("./sourceInfo");
const utils_1 = require("./utils");
const case_1 = require("./case");
const generate_nestjs_1 = require("./generate-nestjs");
const generate_services_1 = require("./generate-services");
const generate_grpc_web_1 = require("./generate-grpc-web");
const generate_async_iterable_1 = require("./generate-async-iterable");
const enums_1 = require("./enums");
const visit_1 = require("./visit");
const options_1 = require("./options");
const schema_1 = require("./schema");
const ConditionalOutput_1 = require("ts-poet/build/ConditionalOutput");
const generate_grpc_js_1 = require("./generate-grpc-js");
const generate_generic_service_definition_1 = require("./generate-generic-service-definition");
const generate_nice_grpc_1 = require("./generate-nice-grpc");
function generateFile(ctx, fileDesc) {
    var _a;
    const { options, utils } = ctx;
    if (options.useOptionals === false) {
        console.warn("ts-proto: Passing useOptionals as a boolean option is deprecated and will be removed in a future version. Please pass the string 'none' instead of false.");
        options.useOptionals = "none";
    }
    else if (options.useOptionals === true) {
        console.warn("ts-proto: Passing useOptionals as a boolean option is deprecated and will be removed in a future version. Please pass the string 'messages' instead of true.");
        options.useOptionals = "messages";
    }
    // Google's protofiles are organized like Java, where package == the folder the file
    // is in, and file == a specific service within the package. I.e. you can have multiple
    // company/foo.proto and company/bar.proto files, where package would be 'company'.
    //
    // We'll match that structure by setting up the module path as:
    //
    // company/foo.proto --> company/foo.ts
    // company/bar.proto --> company/bar.ts
    //
    // We'll also assume that the fileDesc.name is already the `company/foo.proto` path, with
    // the package already implicitly in it, so we won't re-append/strip/etc. it out/back in.
    const suffix = `${options.fileSuffix}.ts`;
    const moduleName = fileDesc.name.replace(".proto", suffix);
    const chunks = [];
    // Indicate this file's source protobuf package for reflective use with google.protobuf.Any
    if (options.exportCommonSymbols) {
        chunks.push((0, ts_poet_1.code) `export const protobufPackage = '${fileDesc.package}';`);
    }
    // Syntax, unlike most fields, is not repeated and thus does not use an index
    const sourceInfo = sourceInfo_1.default.fromDescriptor(fileDesc);
    const headerComment = sourceInfo.lookup(sourceInfo_1.Fields.file.syntax, undefined);
    (0, utils_1.maybeAddComment)(headerComment, chunks, (_a = fileDesc.options) === null || _a === void 0 ? void 0 : _a.deprecated);
    // Apply formatting to methods here, so they propagate globally
    for (let svc of fileDesc.service) {
        for (let i = 0; i < svc.method.length; i++) {
            svc.method[i] = new utils_1.FormattedMethodDescriptor(svc.method[i], options);
        }
    }
    // first make all the type declarations
    (0, visit_1.visit)(fileDesc, sourceInfo, (fullName, message, sInfo, fullProtoTypeName) => {
        chunks.push(generateInterfaceDeclaration(ctx, fullName, message, sInfo, (0, utils_1.maybePrefixPackage)(fileDesc, fullProtoTypeName)));
    }, options, (fullName, enumDesc, sInfo) => {
        chunks.push((0, enums_1.generateEnum)(ctx, fullName, enumDesc, sInfo));
    });
    // If nestJs=true export [package]_PACKAGE_NAME and [service]_SERVICE_NAME const
    if (options.nestJs) {
        const prefix = (0, case_1.camelToSnake)(fileDesc.package.replace(/\./g, "_"));
        chunks.push((0, ts_poet_1.code) `export const ${prefix}_PACKAGE_NAME = '${fileDesc.package}';`);
        if (options.useDate === options_1.DateOption.DATE &&
            fileDesc.messageType.find((message) => message.field.find((field) => field.typeName === ".google.protobuf.Timestamp"))) {
            chunks.push(makeProtobufTimestampWrapper());
        }
    }
    if (options.outputEncodeMethods || options.outputJsonMethods || options.outputTypeRegistry) {
        // then add the encoder/decoder/base instance
        (0, visit_1.visit)(fileDesc, sourceInfo, (fullName, message, sInfo, fullProtoTypeName) => {
            const fullTypeName = (0, utils_1.maybePrefixPackage)(fileDesc, fullProtoTypeName);
            chunks.push(generateBaseInstanceFactory(ctx, fullName, message, fullTypeName));
            const staticMembers = [];
            if (options.outputTypeRegistry) {
                staticMembers.push((0, ts_poet_1.code) `$type: '${fullTypeName}' as const`);
            }
            if (options.outputEncodeMethods) {
                staticMembers.push(generateEncode(ctx, fullName, message));
                staticMembers.push(generateDecode(ctx, fullName, message));
            }
            if (options.useAsyncIterable) {
                staticMembers.push((0, generate_async_iterable_1.generateEncodeTransform)(fullName));
                staticMembers.push((0, generate_async_iterable_1.generateDecodeTransform)(fullName));
            }
            if (options.outputJsonMethods) {
                staticMembers.push(generateFromJson(ctx, fullName, fullTypeName, message));
                staticMembers.push(generateToJson(ctx, fullName, fullTypeName, message));
            }
            if (options.outputPartialMethods) {
                staticMembers.push(generateFromPartial(ctx, fullName, message));
            }
            const structFieldNames = {
                nullValue: (0, case_1.maybeSnakeToCamel)("null_value", ctx.options),
                numberValue: (0, case_1.maybeSnakeToCamel)("number_value", ctx.options),
                stringValue: (0, case_1.maybeSnakeToCamel)("string_value", ctx.options),
                boolValue: (0, case_1.maybeSnakeToCamel)("bool_value", ctx.options),
                structValue: (0, case_1.maybeSnakeToCamel)("struct_value", ctx.options),
                listValue: (0, case_1.maybeSnakeToCamel)("list_value", ctx.options),
            };
            staticMembers.push(...generateWrap(ctx, fullTypeName, structFieldNames));
            staticMembers.push(...generateUnwrap(ctx, fullTypeName, structFieldNames));
            chunks.push((0, ts_poet_1.code) `
          export const ${(0, ts_poet_1.def)(fullName)} = {
            ${(0, ts_poet_1.joinCode)(staticMembers, { on: ",\n\n" })}
          };
        `);
            if (options.outputTypeRegistry) {
                const messageTypeRegistry = (0, utils_1.impFile)(options, "messageTypeRegistry@./typeRegistry");
                chunks.push((0, ts_poet_1.code) `
            ${messageTypeRegistry}.set(${fullName}.$type, ${fullName});
          `);
            }
        }, options);
    }
    let hasServerStreamingMethods = false;
    let hasStreamingMethods = false;
    (0, visit_1.visitServices)(fileDesc, sourceInfo, (serviceDesc, sInfo) => {
        if (options.nestJs) {
            // NestJS is sufficiently different that we special case all of the client/server interfaces
            // generate nestjs grpc client interface
            chunks.push((0, generate_nestjs_1.generateNestjsServiceClient)(ctx, fileDesc, sInfo, serviceDesc));
            // and the service controller interface
            chunks.push((0, generate_nestjs_1.generateNestjsServiceController)(ctx, fileDesc, sInfo, serviceDesc));
            // generate nestjs grpc service controller decorator
            chunks.push((0, generate_nestjs_1.generateNestjsGrpcServiceMethodsDecorator)(ctx, serviceDesc));
            let serviceConstName = `${(0, case_1.camelToSnake)(serviceDesc.name)}_NAME`;
            if (!serviceDesc.name.toLowerCase().endsWith("service")) {
                serviceConstName = `${(0, case_1.camelToSnake)(serviceDesc.name)}_SERVICE_NAME`;
            }
            chunks.push((0, ts_poet_1.code) `export const ${serviceConstName} = "${serviceDesc.name}";`);
        }
        else {
            const uniqueServices = [...new Set(options.outputServices)].sort();
            uniqueServices.forEach((outputService) => {
                if (outputService === options_1.ServiceOption.GRPC) {
                    chunks.push((0, generate_grpc_js_1.generateGrpcJsService)(ctx, fileDesc, sInfo, serviceDesc));
                }
                else if (outputService === options_1.ServiceOption.NICE_GRPC) {
                    chunks.push((0, generate_nice_grpc_1.generateNiceGrpcService)(ctx, fileDesc, sInfo, serviceDesc));
                }
                else if (outputService === options_1.ServiceOption.GENERIC) {
                    chunks.push((0, generate_generic_service_definition_1.generateGenericServiceDefinition)(ctx, fileDesc, sInfo, serviceDesc));
                }
                else if (outputService === options_1.ServiceOption.DEFAULT) {
                    // This service could be Twirp or grpc-web or JSON (maybe). So far all of their
                    // interfaces are fairly similar so we share the same service interface.
                    chunks.push((0, generate_services_1.generateService)(ctx, fileDesc, sInfo, serviceDesc));
                    if (options.outputClientImpl === true) {
                        chunks.push((0, generate_services_1.generateServiceClientImpl)(ctx, fileDesc, serviceDesc));
                    }
                    else if (options.outputClientImpl === "grpc-web") {
                        chunks.push((0, generate_grpc_web_1.generateGrpcClientImpl)(ctx, fileDesc, serviceDesc));
                        chunks.push((0, generate_grpc_web_1.generateGrpcServiceDesc)(fileDesc, serviceDesc));
                        serviceDesc.method.forEach((method) => {
                            if (!method.clientStreaming) {
                                chunks.push((0, generate_grpc_web_1.generateGrpcMethodDesc)(ctx, serviceDesc, method));
                            }
                            if (method.serverStreaming) {
                                hasServerStreamingMethods = true;
                            }
                        });
                    }
                }
            });
        }
        serviceDesc.method.forEach((methodDesc, index) => {
            if (methodDesc.serverStreaming || methodDesc.clientStreaming) {
                hasStreamingMethods = true;
            }
        });
    });
    if (options.outputServices.includes(options_1.ServiceOption.DEFAULT) &&
        options.outputClientImpl &&
        fileDesc.service.length > 0) {
        if (options.outputClientImpl === true) {
            chunks.push((0, generate_services_1.generateRpcType)(ctx, hasStreamingMethods));
        }
        else if (options.outputClientImpl === "grpc-web") {
            chunks.push((0, generate_grpc_web_1.addGrpcWebMisc)(ctx, hasServerStreamingMethods));
        }
    }
    if (options.context) {
        chunks.push((0, generate_services_1.generateDataLoaderOptionsType)());
        chunks.push((0, generate_services_1.generateDataLoadersType)());
    }
    if (options.outputSchema) {
        chunks.push(...(0, schema_1.generateSchema)(ctx, fileDesc, sourceInfo));
    }
    chunks.push(...Object.values(utils).map((v) => {
        if (v instanceof ConditionalOutput_1.ConditionalOutput) {
            return (0, ts_poet_1.code) `${v.ifUsed}`;
        }
        else {
            return (0, ts_poet_1.code) ``;
        }
    }));
    // Finally, reset method definitions to their original state (unformatted)
    // This is mainly so that the `meta-typings` tests pass
    for (let svc of fileDesc.service) {
        for (let i = 0; i < svc.method.length; i++) {
            const methodInfo = svc.method[i];
            (0, utils_1.assertInstanceOf)(methodInfo, utils_1.FormattedMethodDescriptor);
            svc.method[i] = methodInfo.getSource();
        }
    }
    return [moduleName, (0, ts_poet_1.joinCode)(chunks, { on: "\n\n" })];
}
exports.generateFile = generateFile;
/** These are runtime utility methods used by the generated code. */
function makeUtils(options) {
    const bytes = makeByteUtils();
    const longs = makeLongUtils(options, bytes);
    return {
        ...bytes,
        ...makeDeepPartial(options, longs),
        ...makeObjectIdMethods(options),
        ...makeTimestampMethods(options, longs),
        ...longs,
        ...makeComparisonUtils(),
        ...makeNiceGrpcServerStreamingMethodResult(),
        ...makeGrpcWebErrorClass(),
    };
}
exports.makeUtils = makeUtils;
function makeProtobufTimestampWrapper() {
    const wrappers = (0, ts_poet_1.imp)("wrappers@protobufjs");
    return (0, ts_poet_1.code) `
      ${wrappers}['.google.protobuf.Timestamp'] = {
        fromObject(value: Date) {
          return {
            seconds: value.getTime() / 1000,
            nanos: (value.getTime() % 1000) * 1e6,
          };
        },
        toObject(message: { seconds: number; nanos: number }) {
          return new Date(message.seconds * 1000 + message.nanos / 1e6);
        },
      } as any;`;
}
function makeLongUtils(options, bytes) {
    // Regardless of which `forceLong` config option we're using, we always use
    // the `long` library to either represent or at least sanity-check 64-bit values
    const util = (0, utils_1.impFile)(options, "util@protobufjs/minimal");
    const configure = (0, utils_1.impFile)(options, "configure@protobufjs/minimal");
    // Before esModuleInterop, we had to use 'import * as Long from long` b/c long is
    // an `export =` module and exports only the Long constructor (which is callable).
    // See https://www.typescriptlang.org/docs/handbook/modules.html#export--and-import--require.
    //
    // With esModuleInterop on, `* as Long` is no longer the constructor, it's the module,
    // so we want to go back to `import { Long } from long`, which is specifically forbidden
    // due to `export =` w/o esModuleInterop.
    //
    // I.e there is not an import for long that "just works" in both esModuleInterop and
    // not esModuleInterop.
    const LongImp = options.esModuleInterop ? (0, ts_poet_1.imp)("Long=long") : (0, ts_poet_1.imp)("Long*long");
    const disclaimer = options.esModuleInterop
        ? ""
        : `
    // If you get a compile-error about 'Constructor<Long> and ... have no overlap',
    // add '--ts_proto_opt=esModuleInterop=true' as a flag when calling 'protoc'.`;
    // Instead of exposing `LongImp` directly, let callers think that they are getting the
    // `imp(Long)` but really it is that + our long initialization snippet. This means the
    // initialization code will only be emitted in files that actually use the Long import.
    const Long = (0, ts_poet_1.conditionalOutput)("Long", (0, ts_poet_1.code) `
      ${disclaimer}
      if (${util}.Long !== ${LongImp}) {
        ${util}.Long = ${LongImp} as any;
        ${configure}();
      }
    `);
    // TODO This is unused?
    const numberToLong = (0, ts_poet_1.conditionalOutput)("numberToLong", (0, ts_poet_1.code) `
      function numberToLong(number: number) {
        return ${Long}.fromNumber(number);
      }
    `);
    const longToString = (0, ts_poet_1.conditionalOutput)("longToString", (0, ts_poet_1.code) `
      function longToString(long: ${Long}) {
        return long.toString();
      }
    `);
    const longToNumber = (0, ts_poet_1.conditionalOutput)("longToNumber", (0, ts_poet_1.code) `
      function longToNumber(long: ${Long}): number {
        if (long.gt(Number.MAX_SAFE_INTEGER)) {
          throw new ${bytes.globalThis}.Error("Value is larger than Number.MAX_SAFE_INTEGER")
        }
        return long.toNumber();
      }
    `);
    return { numberToLong, longToNumber, longToString, Long };
}
function makeByteUtils() {
    const globalThis = (0, ts_poet_1.conditionalOutput)("globalThis", (0, ts_poet_1.code) `
      declare var self: any | undefined;
      declare var window: any | undefined;
      declare var global: any | undefined;
      var globalThis: any = (() => {
        if (typeof globalThis !== "undefined") return globalThis;
        if (typeof self !== "undefined") return self;
        if (typeof window !== "undefined") return window;
        if (typeof global !== "undefined") return global;
        throw "Unable to locate global object";
      })();
    `);
    const bytesFromBase64 = (0, ts_poet_1.conditionalOutput)("bytesFromBase64", (0, ts_poet_1.code) `
      function bytesFromBase64(b64: string): Uint8Array {
        if (${globalThis}.Buffer) {
          return Uint8Array.from(${globalThis}.Buffer.from(b64, 'base64'));
        } else {
          const bin = ${globalThis}.atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; ++i) {
              arr[i] = bin.charCodeAt(i);
          }
          return arr;
        }
      }
    `);
    const base64FromBytes = (0, ts_poet_1.conditionalOutput)("base64FromBytes", (0, ts_poet_1.code) `
      function base64FromBytes(arr: Uint8Array): string {
        if (${globalThis}.Buffer) {
          return ${globalThis}.Buffer.from(arr).toString('base64')
        } else {
          const bin: string[] = [];
          arr.forEach((byte) => {
            bin.push(String.fromCharCode(byte));
          });
          return ${globalThis}.btoa(bin.join(''));
        }
      }
    `);
    return { globalThis, bytesFromBase64, base64FromBytes };
}
function makeDeepPartial(options, longs) {
    let oneofCase = "";
    if (options.oneof === options_1.OneofOption.UNIONS) {
        oneofCase = `
      : T extends { ${maybeReadonly(options)}$case: string }
      ? { [K in keyof Omit<T, '$case'>]?: DeepPartial<T[K]> } & { ${maybeReadonly(options)}$case: T['$case'] }
    `;
    }
    const maybeExport = options.exportCommonSymbols ? "export" : "";
    // Allow passing longs as numbers or strings, nad we'll convert them
    const maybeLong = options.forceLong === options_1.LongOption.LONG ? (0, ts_poet_1.code) ` : T extends ${longs.Long} ? string | number | Long ` : "";
    const Builtin = (0, ts_poet_1.conditionalOutput)("Builtin", (0, ts_poet_1.code) `type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;`);
    // Based on https://github.com/sindresorhus/type-fest/pull/259
    const maybeExcludeType = options.outputTypeRegistry ? `| '$type'` : "";
    const Exact = (0, ts_poet_1.conditionalOutput)("Exact", (0, ts_poet_1.code) `
      type KeysOfUnion<T> = T extends T ? keyof T : never;
      ${maybeExport} type Exact<P, I extends P> = P extends ${Builtin}
        ? P
        : P &
        { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P> ${maybeExcludeType}>]: never };
    `);
    // Based on the type from ts-essentials
    const keys = options.outputTypeRegistry ? (0, ts_poet_1.code) `Exclude<keyof T, '$type'>` : (0, ts_poet_1.code) `keyof T`;
    const DeepPartial = (0, ts_poet_1.conditionalOutput)("DeepPartial", (0, ts_poet_1.code) `
      ${maybeExport} type DeepPartial<T> =  T extends ${Builtin}
        ? T
        ${maybeLong}
        : T extends Array<infer U>
        ? Array<DeepPartial<U>>
        : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepPartial<U>>${oneofCase}
        : T extends {}
        ? { [K in ${keys}]?: DeepPartial<T[K]> }
        : Partial<T>;
    `);
    return { Builtin, DeepPartial, Exact };
}
function makeObjectIdMethods(options) {
    const mongodb = (0, ts_poet_1.imp)("mongodb*mongodb");
    const fromProtoObjectId = (0, ts_poet_1.conditionalOutput)("fromProtoObjectId", (0, ts_poet_1.code) `
      function fromProtoObjectId(oid: ObjectId): ${mongodb}.ObjectId {
        return new ${mongodb}.ObjectId(oid.value);
      }
    `);
    const fromJsonObjectId = (0, ts_poet_1.conditionalOutput)("fromJsonObjectId", (0, ts_poet_1.code) `
      function fromJsonObjectId(o: any): ${mongodb}.ObjectId {
        if (o instanceof ${mongodb}.ObjectId) {
          return o;
        } else if (typeof o === "string") {
          return new ${mongodb}.ObjectId(o);
        } else {
          return ${fromProtoObjectId}(ObjectId.fromJSON(o));
        }
      }
    `);
    const toProtoObjectId = (0, ts_poet_1.conditionalOutput)("toProtoObjectId", (0, ts_poet_1.code) `
      function toProtoObjectId(oid: ${mongodb}.ObjectId): ObjectId {
        const value = oid.toString();
        return { value };
      }
    `);
    return { fromJsonObjectId, fromProtoObjectId, toProtoObjectId };
}
function makeTimestampMethods(options, longs) {
    const Timestamp = (0, utils_1.impProto)(options, "google/protobuf/timestamp", "Timestamp");
    let seconds = "date.getTime() / 1_000";
    let toNumberCode = "t.seconds";
    if (options.forceLong === options_1.LongOption.LONG) {
        toNumberCode = "t.seconds.toNumber()";
        seconds = (0, ts_poet_1.code) `${longs.numberToLong}(date.getTime() / 1_000)`;
    }
    else if (options.forceLong === options_1.LongOption.STRING) {
        toNumberCode = "Number(t.seconds)";
        // Must discard the fractional piece here
        // Otherwise the fraction ends up on the seconds when parsed as a Long
        // (note this only occurs when the string is > 8 characters)
        seconds = "Math.trunc(date.getTime() / 1_000).toString()";
    }
    const maybeTypeField = options.outputTypeRegistry ? `$type: 'google.protobuf.Timestamp',` : "";
    const toTimestamp = (0, ts_poet_1.conditionalOutput)("toTimestamp", options.useDate === options_1.DateOption.STRING
        ? (0, ts_poet_1.code) `
          function toTimestamp(dateStr: string): ${Timestamp} {
            const date = new Date(dateStr);
            const seconds = ${seconds};
            const nanos = (date.getTime() % 1_000) * 1_000_000;
            return { ${maybeTypeField} seconds, nanos };
          }
        `
        : (0, ts_poet_1.code) `
          function toTimestamp(date: Date): ${Timestamp} {
            const seconds = ${seconds};
            const nanos = (date.getTime() % 1_000) * 1_000_000;
            return { ${maybeTypeField} seconds, nanos };
          }
        `);
    const fromTimestamp = (0, ts_poet_1.conditionalOutput)("fromTimestamp", options.useDate === options_1.DateOption.STRING
        ? (0, ts_poet_1.code) `
          function fromTimestamp(t: ${Timestamp}): string {
            let millis = ${toNumberCode} * 1_000;
            millis += t.nanos / 1_000_000;
            return new Date(millis).toISOString();
          }
        `
        : (0, ts_poet_1.code) `
          function fromTimestamp(t: ${Timestamp}): Date {
            let millis = ${toNumberCode} * 1_000;
            millis += t.nanos / 1_000_000;
            return new Date(millis);
          }
        `);
    const fromJsonTimestamp = (0, ts_poet_1.conditionalOutput)("fromJsonTimestamp", options.useDate === options_1.DateOption.DATE
        ? (0, ts_poet_1.code) `
        function fromJsonTimestamp(o: any): Date {
          if (o instanceof Date) {
            return o;
          } else if (typeof o === "string") {
            return new Date(o);
          } else {
            return ${fromTimestamp}(Timestamp.fromJSON(o));
          }
        }
      `
        : (0, ts_poet_1.code) `
        function fromJsonTimestamp(o: any): Timestamp {
          if (o instanceof Date) {
            return ${toTimestamp}(o);
          } else if (typeof o === "string") {
            return ${toTimestamp}(new Date(o));
          } else {
            return Timestamp.fromJSON(o);
          }
        }
      `);
    return { toTimestamp, fromTimestamp, fromJsonTimestamp };
}
function makeComparisonUtils() {
    const isObject = (0, ts_poet_1.conditionalOutput)("isObject", (0, ts_poet_1.code) `
    function isObject(value: any): boolean {
      return typeof value === 'object' && value !== null;
    }`);
    const isSet = (0, ts_poet_1.conditionalOutput)("isSet", (0, ts_poet_1.code) `
    function isSet(value: any): boolean {
      return value !== null && value !== undefined;
    }`);
    return { isObject, isSet };
}
function makeNiceGrpcServerStreamingMethodResult() {
    const NiceGrpcServerStreamingMethodResult = (0, ts_poet_1.conditionalOutput)("ServerStreamingMethodResult", (0, ts_poet_1.code) `
      export type ServerStreamingMethodResult<Response> = {
        [Symbol.asyncIterator](): AsyncIterator<Response, void>;
      };
    `);
    return { NiceGrpcServerStreamingMethodResult };
}
function makeGrpcWebErrorClass() {
    const GrpcWebError = (0, ts_poet_1.conditionalOutput)("GrpcWebError", (0, ts_poet_1.code) `
      export class GrpcWebError extends globalThis.Error {
        constructor(message: string, public code: grpc.Code, public metadata: grpc.Metadata) {
          super(message);
        }
      }
    `);
    return { GrpcWebError };
}
// Create the interface with properties
function generateInterfaceDeclaration(ctx, fullName, messageDesc, sourceInfo, fullTypeName) {
    var _a;
    const { options } = ctx;
    const chunks = [];
    (0, utils_1.maybeAddComment)(sourceInfo, chunks, (_a = messageDesc.options) === null || _a === void 0 ? void 0 : _a.deprecated);
    // interface name should be defined to avoid import collisions
    chunks.push((0, ts_poet_1.code) `export interface ${(0, ts_poet_1.def)(fullName)} {`);
    if (ctx.options.outputTypeRegistry) {
        chunks.push((0, ts_poet_1.code) `$type: '${fullTypeName}',`);
    }
    // When oneof=unions, we generate a single property with an ADT per `oneof` clause.
    const processedOneofs = new Set();
    messageDesc.field.forEach((fieldDesc, index) => {
        var _a;
        if ((0, types_1.isWithinOneOfThatShouldBeUnion)(options, fieldDesc)) {
            const { oneofIndex } = fieldDesc;
            if (!processedOneofs.has(oneofIndex)) {
                processedOneofs.add(oneofIndex);
                chunks.push(generateOneofProperty(ctx, messageDesc, oneofIndex, sourceInfo));
            }
            return;
        }
        const info = sourceInfo.lookup(sourceInfo_1.Fields.message.field, index);
        (0, utils_1.maybeAddComment)(info, chunks, (_a = fieldDesc.options) === null || _a === void 0 ? void 0 : _a.deprecated);
        const name = (0, case_1.maybeSnakeToCamel)(fieldDesc.name, options);
        const type = (0, types_1.toTypeName)(ctx, messageDesc, fieldDesc);
        const q = (0, types_1.isOptionalProperty)(fieldDesc, messageDesc.options, options) ? "?" : "";
        chunks.push((0, ts_poet_1.code) `${maybeReadonly(options)}${name}${q}: ${type}, `);
    });
    chunks.push((0, ts_poet_1.code) `}`);
    return (0, ts_poet_1.joinCode)(chunks, { on: "\n" });
}
function generateOneofProperty(ctx, messageDesc, oneofIndex, sourceInfo) {
    const { options } = ctx;
    const fields = messageDesc.field.filter((field) => (0, types_1.isWithinOneOf)(field) && field.oneofIndex === oneofIndex);
    const mbReadonly = maybeReadonly(options);
    const unionType = (0, ts_poet_1.joinCode)(fields.map((f) => {
        let fieldName = (0, case_1.maybeSnakeToCamel)(f.name, options);
        let typeName = (0, types_1.toTypeName)(ctx, messageDesc, f);
        return (0, ts_poet_1.code) `{ ${mbReadonly}$case: '${fieldName}', ${mbReadonly}${fieldName}: ${typeName} }`;
    }), { on: " | " });
    const name = (0, case_1.maybeSnakeToCamel)(messageDesc.oneofDecl[oneofIndex].name, options);
    return (0, ts_poet_1.code) `${mbReadonly}${name}?: ${unionType},`;
    /*
    // Ideally we'd put the comments for each oneof field next to the anonymous
    // type we've created in the type union above, but ts-poet currently lacks
    // that ability. For now just concatenate all comments into one big one.
    let comments: Array<string> = [];
    const info = sourceInfo.lookup(Fields.message.oneof_decl, oneofIndex);
    maybeAddComment(info, (text) => comments.push(text));
    messageDesc.field.forEach((field, index) => {
      if (!isWithinOneOf(field) || field.oneofIndex !== oneofIndex) {
        return;
      }
      const info = sourceInfo.lookup(Fields.message.field, index);
      const name = maybeSnakeToCamel(field.name, options);
      maybeAddComment(info, (text) => comments.push(name + '\n' + text));
    });
    if (comments.length) {
      prop = prop.addJavadoc(comments.join('\n'));
    }
    return prop;
    */
}
// Create a function that constructs 'base' instance with default values for decode to use as a prototype
function generateBaseInstanceFactory(ctx, fullName, messageDesc, fullTypeName) {
    const { options } = ctx;
    const fields = [];
    // When oneof=unions, we generate a single property with an ADT per `oneof` clause.
    const processedOneofs = new Set();
    for (const field of messageDesc.field) {
        if ((0, types_1.isWithinOneOfThatShouldBeUnion)(ctx.options, field)) {
            const { oneofIndex } = field;
            if (!processedOneofs.has(oneofIndex)) {
                processedOneofs.add(oneofIndex);
                const name = (0, case_1.maybeSnakeToCamel)(messageDesc.oneofDecl[oneofIndex].name, ctx.options);
                fields.push((0, ts_poet_1.code) `${name}: undefined`);
            }
            continue;
        }
        if (!options.initializeFieldsAsUndefined && (0, types_1.isOptionalProperty)(field, messageDesc.options, options)) {
            continue;
        }
        const name = (0, case_1.maybeSnakeToCamel)(field.name, ctx.options);
        const val = (0, types_1.isWithinOneOf)(field)
            ? "undefined"
            : (0, types_1.isMapType)(ctx, messageDesc, field)
                ? ctx.options.useMapType
                    ? "new Map()"
                    : "{}"
                : (0, types_1.isRepeated)(field)
                    ? "[]"
                    : (0, types_1.defaultValue)(ctx, field);
        fields.push((0, ts_poet_1.code) `${name}: ${val}`);
    }
    if (ctx.options.outputTypeRegistry) {
        fields.unshift((0, ts_poet_1.code) `$type: '${fullTypeName}'`);
    }
    return (0, ts_poet_1.code) `
    function createBase${fullName}(): ${fullName} {
      return { ${(0, ts_poet_1.joinCode)(fields, { on: "," })} };
    }
  `;
}
/** Creates a function to decode a message by loop overing the tags. */
function generateDecode(ctx, fullName, messageDesc) {
    const { options, utils, typeMap } = ctx;
    const chunks = [];
    let createBase = (0, ts_poet_1.code) `createBase${fullName}()`;
    if (options.usePrototypeForDefaults) {
        createBase = (0, ts_poet_1.code) `Object.create(${createBase}) as ${fullName}`;
    }
    const Reader = (0, utils_1.impFile)(ctx.options, "Reader@protobufjs/minimal");
    // create the basic function declaration
    chunks.push((0, ts_poet_1.code) `
    decode(
      input: ${Reader} | Uint8Array,
      length?: number,
    ): ${fullName} {
      const reader = input instanceof ${Reader} ? input : new ${Reader}(input);
      let end = length === undefined ? reader.len : reader.pos + length;
  `);
    chunks.push((0, ts_poet_1.code) `const message = ${createBase}${maybeAsAny(options)};`);
    if (options.unknownFields) {
        chunks.push((0, ts_poet_1.code) `(message as any)._unknownFields = {}`);
    }
    // start the tag loop
    chunks.push((0, ts_poet_1.code) `
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
  `);
    // add a case for each incoming field
    messageDesc.field.forEach((field) => {
        const fieldName = (0, case_1.maybeSnakeToCamel)(field.name, options);
        chunks.push((0, ts_poet_1.code) `case ${field.number}:`);
        // get a generic 'reader.doSomething' bit that is specific to the basic type
        let readSnippet;
        if ((0, types_1.isPrimitive)(field)) {
            readSnippet = (0, ts_poet_1.code) `reader.${(0, types_1.toReaderCall)(field)}()`;
            if ((0, types_1.isBytes)(field)) {
                if (options.env === options_1.EnvOption.NODE) {
                    readSnippet = (0, ts_poet_1.code) `${readSnippet} as Buffer`;
                }
            }
            else if ((0, types_1.basicLongWireType)(field.type) !== undefined) {
                if (options.forceLong === options_1.LongOption.LONG) {
                    readSnippet = (0, ts_poet_1.code) `${readSnippet} as Long`;
                }
                else if (options.forceLong === options_1.LongOption.STRING) {
                    readSnippet = (0, ts_poet_1.code) `${utils.longToString}(${readSnippet} as Long)`;
                }
                else {
                    readSnippet = (0, ts_poet_1.code) `${utils.longToNumber}(${readSnippet} as Long)`;
                }
            }
            else if ((0, types_1.isEnum)(field)) {
                if (options.stringEnums) {
                    const fromJson = (0, types_1.getEnumMethod)(ctx, field.typeName, "FromJSON");
                    readSnippet = (0, ts_poet_1.code) `${fromJson}(${readSnippet})`;
                }
                else {
                    readSnippet = (0, ts_poet_1.code) `${readSnippet} as any`;
                }
            }
        }
        else if ((0, types_1.isValueType)(ctx, field)) {
            const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
            const unwrap = (decodedValue) => {
                if ((0, types_1.isListValueType)(field) || (0, types_1.isStructType)(field) || (0, types_1.isAnyValueType)(field) || (0, types_1.isFieldMaskType)(field)) {
                    return (0, ts_poet_1.code) `${type}.unwrap(${decodedValue})`;
                }
                return (0, ts_poet_1.code) `${decodedValue}.value`;
            };
            const decoder = (0, ts_poet_1.code) `${type}.decode(reader, reader.uint32())`;
            readSnippet = (0, ts_poet_1.code) `${unwrap(decoder)}`;
        }
        else if ((0, types_1.isTimestamp)(field) && (options.useDate === options_1.DateOption.DATE || options.useDate === options_1.DateOption.STRING)) {
            const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
            readSnippet = (0, ts_poet_1.code) `${utils.fromTimestamp}(${type}.decode(reader, reader.uint32()))`;
        }
        else if ((0, types_1.isObjectId)(field) && options.useMongoObjectId) {
            const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
            readSnippet = (0, ts_poet_1.code) `${utils.fromProtoObjectId}(${type}.decode(reader, reader.uint32()))`;
        }
        else if ((0, types_1.isMessage)(field)) {
            const type = (0, types_1.basicTypeName)(ctx, field);
            readSnippet = (0, ts_poet_1.code) `${type}.decode(reader, reader.uint32())`;
        }
        else {
            throw new Error(`Unhandled field ${field}`);
        }
        // and then use the snippet to handle repeated fields if necessary
        if ((0, types_1.isRepeated)(field)) {
            const maybeNonNullAssertion = ctx.options.useOptionals === "all" ? "!" : "";
            if ((0, types_1.isMapType)(ctx, messageDesc, field)) {
                // We need a unique const within the `cast` statement
                const varName = `entry${field.number}`;
                const valueSetterSnippet = ctx.options.useMapType
                    ? `message.${fieldName}${maybeNonNullAssertion}.set(${varName}.key, ${varName}.value)`
                    : `message.${fieldName}${maybeNonNullAssertion}[${varName}.key] = ${varName}.value`;
                chunks.push((0, ts_poet_1.code) `
          const ${varName} = ${readSnippet};
          if (${varName}.value !== undefined) {
            ${valueSetterSnippet};
          }
        `);
            }
            else if ((0, types_1.packedType)(field.type) === undefined) {
                chunks.push((0, ts_poet_1.code) `message.${fieldName}${maybeNonNullAssertion}.push(${readSnippet});`);
            }
            else {
                chunks.push((0, ts_poet_1.code) `
          if ((tag & 7) === 2) {
            const end2 = reader.uint32() + reader.pos;
            while (reader.pos < end2) {
              message.${fieldName}${maybeNonNullAssertion}.push(${readSnippet});
            }
          } else {
            message.${fieldName}${maybeNonNullAssertion}.push(${readSnippet});
          }
        `);
            }
        }
        else if ((0, types_1.isWithinOneOfThatShouldBeUnion)(options, field)) {
            let oneofName = (0, case_1.maybeSnakeToCamel)(messageDesc.oneofDecl[field.oneofIndex].name, options);
            chunks.push((0, ts_poet_1.code) `message.${oneofName} = { $case: '${fieldName}', ${fieldName}: ${readSnippet} };`);
        }
        else {
            chunks.push((0, ts_poet_1.code) `message.${fieldName} = ${readSnippet};`);
        }
        chunks.push((0, ts_poet_1.code) `break;`);
    });
    if (options.unknownFields) {
        chunks.push((0, ts_poet_1.code) `
      default:
        const startPos = reader.pos;
        reader.skipType(tag & 7);
        (message as any)._unknownFields[tag] = [...((message as any)._unknownFields[tag] || []), reader.buf.slice(startPos, reader.pos)];
        break;
    `);
    }
    else {
        chunks.push((0, ts_poet_1.code) `
      default:
        reader.skipType(tag & 7);
        break;
    `);
    }
    // and then wrap up the switch/while/return
    chunks.push((0, ts_poet_1.code) `}`);
    chunks.push((0, ts_poet_1.code) `}`);
    chunks.push((0, ts_poet_1.code) `return message;`);
    chunks.push((0, ts_poet_1.code) `}`);
    return (0, ts_poet_1.joinCode)(chunks, { on: "\n" });
}
/** Creates a function to encode a message by loop overing the tags. */
function generateEncode(ctx, fullName, messageDesc) {
    const { options, utils, typeMap } = ctx;
    const chunks = [];
    const Writer = (0, utils_1.impFile)(ctx.options, "Writer@protobufjs/minimal");
    // create the basic function declaration
    chunks.push((0, ts_poet_1.code) `
    encode(
      ${messageDesc.field.length > 0 || options.unknownFields ? "message" : "_"}: ${fullName},
      writer: ${Writer} = ${Writer}.create(),
    ): ${Writer} {
  `);
    // then add a case for each field
    messageDesc.field.forEach((field) => {
        const fieldName = (0, case_1.maybeSnakeToCamel)(field.name, options);
        // get a generic writer.doSomething based on the basic type
        let writeSnippet;
        if ((0, types_1.isEnum)(field) && options.stringEnums) {
            const tag = ((field.number << 3) | (0, types_1.basicWireType)(field.type)) >>> 0;
            const toNumber = (0, types_1.getEnumMethod)(ctx, field.typeName, "ToNumber");
            writeSnippet = (place) => (0, ts_poet_1.code) `writer.uint32(${tag}).${(0, types_1.toReaderCall)(field)}(${toNumber}(${place}))`;
        }
        else if ((0, types_1.isScalar)(field) || (0, types_1.isEnum)(field)) {
            const tag = ((field.number << 3) | (0, types_1.basicWireType)(field.type)) >>> 0;
            writeSnippet = (place) => (0, ts_poet_1.code) `writer.uint32(${tag}).${(0, types_1.toReaderCall)(field)}(${place})`;
        }
        else if ((0, types_1.isObjectId)(field) && options.useMongoObjectId) {
            const tag = ((field.number << 3) | 2) >>> 0;
            const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
            writeSnippet = (place) => (0, ts_poet_1.code) `${type}.encode(${utils.toProtoObjectId}(${place}), writer.uint32(${tag}).fork()).ldelim()`;
        }
        else if ((0, types_1.isTimestamp)(field) && (options.useDate === options_1.DateOption.DATE || options.useDate === options_1.DateOption.STRING)) {
            const tag = ((field.number << 3) | 2) >>> 0;
            const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
            writeSnippet = (place) => (0, ts_poet_1.code) `${type}.encode(${utils.toTimestamp}(${place}), writer.uint32(${tag}).fork()).ldelim()`;
        }
        else if ((0, types_1.isValueType)(ctx, field)) {
            const maybeTypeField = options.outputTypeRegistry ? `$type: '${field.typeName.slice(1)}',` : "";
            const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
            const wrappedValue = (place) => {
                if ((0, types_1.isAnyValueType)(field) || (0, types_1.isListValueType)(field) || (0, types_1.isStructType)(field) || (0, types_1.isFieldMaskType)(field)) {
                    return (0, ts_poet_1.code) `${type}.wrap(${place})`;
                }
                return (0, ts_poet_1.code) `{${maybeTypeField} value: ${place}!}`;
            };
            const tag = ((field.number << 3) | 2) >>> 0;
            writeSnippet = (place) => (0, ts_poet_1.code) `${type}.encode(${wrappedValue(place)}, writer.uint32(${tag}).fork()).ldelim()`;
        }
        else if ((0, types_1.isMessage)(field)) {
            const tag = ((field.number << 3) | 2) >>> 0;
            const type = (0, types_1.basicTypeName)(ctx, field);
            writeSnippet = (place) => (0, ts_poet_1.code) `${type}.encode(${place}, writer.uint32(${tag}).fork()).ldelim()`;
        }
        else {
            throw new Error(`Unhandled field ${field}`);
        }
        const isOptional = (0, types_1.isOptionalProperty)(field, messageDesc.options, options);
        if ((0, types_1.isRepeated)(field)) {
            if ((0, types_1.isMapType)(ctx, messageDesc, field)) {
                const valueType = typeMap.get(field.typeName)[2].field[1];
                const maybeTypeField = options.outputTypeRegistry ? `$type: '${field.typeName.slice(1)}',` : "";
                const entryWriteSnippet = (0, types_1.isValueType)(ctx, valueType)
                    ? (0, ts_poet_1.code) `
              if (value !== undefined) {
                ${writeSnippet(`{ ${maybeTypeField} key: key as any, value }`)};
              }
            `
                    : writeSnippet(`{ ${maybeTypeField} key: key as any, value }`);
                const optionalAlternative = isOptional ? " || {}" : "";
                if (ctx.options.useMapType) {
                    chunks.push((0, ts_poet_1.code) `
            message.${fieldName}${optionalAlternative}.forEach((value, key) => {
              ${entryWriteSnippet}
            });
          `);
                }
                else {
                    chunks.push((0, ts_poet_1.code) `
            Object.entries(message.${fieldName}${optionalAlternative}).forEach(([key, value]) => {
              ${entryWriteSnippet}
            });
          `);
                }
            }
            else if ((0, types_1.packedType)(field.type) === undefined) {
                const listWriteSnippet = (0, ts_poet_1.code) `
          for (const v of message.${fieldName}) {
            ${writeSnippet("v!")};
          }
        `;
                if (isOptional) {
                    chunks.push((0, ts_poet_1.code) `
            if (message.${fieldName} !== undefined && message.${fieldName}.length !== 0) {
              ${listWriteSnippet}
            }
          `);
                }
                else {
                    chunks.push(listWriteSnippet);
                }
            }
            else if ((0, types_1.isEnum)(field) && options.stringEnums) {
                // This is a lot like the `else` clause, but we wrap `fooToNumber` around it.
                // Ideally we'd reuse `writeSnippet` here, but `writeSnippet` has the `writer.uint32(tag)`
                // embedded inside of it, and we want to drop that so that we can encode it packed
                // (i.e. just one tag and multiple values).
                const tag = ((field.number << 3) | 2) >>> 0;
                const toNumber = (0, types_1.getEnumMethod)(ctx, field.typeName, "ToNumber");
                const listWriteSnippet = (0, ts_poet_1.code) `
          writer.uint32(${tag}).fork();
          for (const v of message.${fieldName}) {
            writer.${(0, types_1.toReaderCall)(field)}(${toNumber}(v));
          }
          writer.ldelim();
        `;
                if (isOptional) {
                    chunks.push((0, ts_poet_1.code) `
            if (message.${fieldName} !== undefined && message.${fieldName}.length !== 0) {
              ${listWriteSnippet}
            }
          `);
                }
                else {
                    chunks.push(listWriteSnippet);
                }
            }
            else {
                // Ideally we'd reuse `writeSnippet` but it has tagging embedded inside of it.
                const tag = ((field.number << 3) | 2) >>> 0;
                const listWriteSnippet = (0, ts_poet_1.code) `
          writer.uint32(${tag}).fork();
          for (const v of message.${fieldName}) {
            writer.${(0, types_1.toReaderCall)(field)}(v);
          }
          writer.ldelim();
        `;
                if (isOptional) {
                    chunks.push((0, ts_poet_1.code) `
            if (message.${fieldName} !== undefined && message.${fieldName}.length !== 0) {
              ${listWriteSnippet}
            }
          `);
                }
                else {
                    chunks.push(listWriteSnippet);
                }
            }
        }
        else if ((0, types_1.isWithinOneOfThatShouldBeUnion)(options, field)) {
            let oneofName = (0, case_1.maybeSnakeToCamel)(messageDesc.oneofDecl[field.oneofIndex].name, options);
            chunks.push((0, ts_poet_1.code) `
        if (message.${oneofName}?.$case === '${fieldName}') {
          ${writeSnippet(`message.${oneofName}.${fieldName}`)};
        }
      `);
        }
        else if ((0, types_1.isWithinOneOf)(field)) {
            // Oneofs don't have a default value check b/c they need to denote which-oneof presence
            chunks.push((0, ts_poet_1.code) `
        if (message.${fieldName} !== undefined) {
          ${writeSnippet(`message.${fieldName}`)};
        }
      `);
        }
        else if ((0, types_1.isMessage)(field)) {
            chunks.push((0, ts_poet_1.code) `
        if (message.${fieldName} !== undefined) {
          ${writeSnippet(`message.${fieldName}`)};
        }
      `);
        }
        else if ((0, types_1.isScalar)(field) || (0, types_1.isEnum)(field)) {
            chunks.push((0, ts_poet_1.code) `
        if (${(0, types_1.notDefaultCheck)(ctx, field, messageDesc.options, `message.${fieldName}`)}) {
          ${writeSnippet(`message.${fieldName}`)};
        }
      `);
        }
        else {
            chunks.push((0, ts_poet_1.code) `${writeSnippet(`message.${fieldName}`)};`);
        }
    });
    if (options.unknownFields) {
        chunks.push((0, ts_poet_1.code) `if ('_unknownFields' in message) {
      const msgUnknownFields: any = (message as any)['_unknownFields']
      for (const key of Object.keys(msgUnknownFields)) {
        const values = msgUnknownFields[key] as Uint8Array[];
        for (const value of values) {
          writer.uint32(parseInt(key, 10));
          (writer as any)['_push'](
            (val: Uint8Array, buf: Buffer, pos: number) => buf.set(val, pos),
            value.length,
            value
          );
        }
      }
    }`);
    }
    chunks.push((0, ts_poet_1.code) `return writer;`);
    chunks.push((0, ts_poet_1.code) `}`);
    return (0, ts_poet_1.joinCode)(chunks, { on: "\n" });
}
/**
 * Creates a function to decode a message from JSON.
 *
 * This is very similar to decode, we loop through looking for properties, with
 * a few special cases for https://developers.google.com/protocol-buffers/docs/proto3#json.
 * */
function generateFromJson(ctx, fullName, fullTypeName, messageDesc) {
    const { options, utils, typeMap } = ctx;
    const chunks = [];
    // create the basic function declaration
    chunks.push((0, ts_poet_1.code) `
    fromJSON(${messageDesc.field.length > 0 ? "object" : "_"}: any): ${fullName} {
      return {
  `);
    if (ctx.options.outputTypeRegistry) {
        chunks.push((0, ts_poet_1.code) `$type: ${fullName}.$type,`);
    }
    const oneofFieldsCases = messageDesc.oneofDecl.map((oneof, oneofIndex) => messageDesc.field.filter(types_1.isWithinOneOf).filter((field) => field.oneofIndex === oneofIndex));
    const canonicalFromJson = {
        ["google.protobuf.FieldMask"]: {
            paths: (from) => (0, ts_poet_1.code) `typeof(${from}) === 'string'
        ? ${from}.split(",").filter(Boolean)
        : Array.isArray(${from}?.paths)
        ? ${from}.paths.map(String)
        : []`,
        },
    };
    // add a check for each incoming field
    messageDesc.field.forEach((field) => {
        var _a;
        const fieldName = (0, case_1.maybeSnakeToCamel)(field.name, options);
        const jsonName = (0, utils_1.getFieldJsonName)(field, options);
        const jsonProperty = (0, utils_1.getPropertyAccessor)("object", jsonName);
        const jsonPropertyOptional = (0, utils_1.getPropertyAccessor)("object", jsonName, true);
        // get code that extracts value from incoming object
        const readSnippet = (from) => {
            if ((0, types_1.isEnum)(field)) {
                const fromJson = (0, types_1.getEnumMethod)(ctx, field.typeName, "FromJSON");
                return (0, ts_poet_1.code) `${fromJson}(${from})`;
            }
            else if ((0, types_1.isPrimitive)(field)) {
                // Convert primitives using the String(value)/Number(value)/bytesFromBase64(value)
                if ((0, types_1.isBytes)(field)) {
                    if (options.env === options_1.EnvOption.NODE) {
                        return (0, ts_poet_1.code) `Buffer.from(${utils.bytesFromBase64}(${from}))`;
                    }
                    else {
                        return (0, ts_poet_1.code) `${utils.bytesFromBase64}(${from})`;
                    }
                }
                else if ((0, types_1.isLong)(field) && options.forceLong === options_1.LongOption.LONG) {
                    const cstr = (0, case_1.capitalize)((0, types_1.basicTypeName)(ctx, field, { keepValueType: true }).toCodeString());
                    return (0, ts_poet_1.code) `${cstr}.fromValue(${from})`;
                }
                else {
                    const cstr = (0, case_1.capitalize)((0, types_1.basicTypeName)(ctx, field, { keepValueType: true }).toCodeString());
                    return (0, ts_poet_1.code) `${cstr}(${from})`;
                }
            }
            else if ((0, types_1.isObjectId)(field) && options.useMongoObjectId) {
                return (0, ts_poet_1.code) `${utils.fromJsonObjectId}(${from})`;
            }
            else if ((0, types_1.isTimestamp)(field) && options.useDate === options_1.DateOption.STRING) {
                return (0, ts_poet_1.code) `String(${from})`;
            }
            else if ((0, types_1.isTimestamp)(field) &&
                (options.useDate === options_1.DateOption.DATE || options.useDate === options_1.DateOption.TIMESTAMP)) {
                return (0, ts_poet_1.code) `${utils.fromJsonTimestamp}(${from})`;
            }
            else if ((0, types_1.isAnyValueType)(field) || (0, types_1.isStructType)(field)) {
                return (0, ts_poet_1.code) `${from}`;
            }
            else if ((0, types_1.isFieldMaskType)(field)) {
                const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
                return (0, ts_poet_1.code) `${type}.unwrap(${type}.fromJSON(${from}))`;
            }
            else if ((0, types_1.isListValueType)(field)) {
                return (0, ts_poet_1.code) `[...${from}]`;
            }
            else if ((0, types_1.isValueType)(ctx, field)) {
                const valueType = (0, types_1.valueTypeName)(ctx, field.typeName);
                if ((0, types_1.isLongValueType)(field) && options.forceLong === options_1.LongOption.LONG) {
                    return (0, ts_poet_1.code) `${(0, case_1.capitalize)(valueType.toCodeString())}.fromValue(${from})`;
                }
                else if ((0, types_1.isBytesValueType)(field)) {
                    return (0, ts_poet_1.code) `new ${(0, case_1.capitalize)(valueType.toCodeString())}(${from})`;
                }
                else {
                    return (0, ts_poet_1.code) `${(0, case_1.capitalize)(valueType.toCodeString())}(${from})`;
                }
            }
            else if ((0, types_1.isMessage)(field)) {
                if ((0, types_1.isRepeated)(field) && (0, types_1.isMapType)(ctx, messageDesc, field)) {
                    const { valueField, valueType } = (0, types_1.detectMapType)(ctx, messageDesc, field);
                    if ((0, types_1.isPrimitive)(valueField)) {
                        // TODO Can we not copy/paste this from ^?
                        if ((0, types_1.isBytes)(valueField)) {
                            if (options.env === options_1.EnvOption.NODE) {
                                return (0, ts_poet_1.code) `Buffer.from(${utils.bytesFromBase64}(${from} as string))`;
                            }
                            else {
                                return (0, ts_poet_1.code) `${utils.bytesFromBase64}(${from} as string)`;
                            }
                        }
                        else if ((0, types_1.isLong)(valueField) && options.forceLong === options_1.LongOption.LONG) {
                            return (0, ts_poet_1.code) `Long.fromValue(${from} as Long | string)`;
                        }
                        else if ((0, types_1.isEnum)(valueField)) {
                            const fromJson = (0, types_1.getEnumMethod)(ctx, valueField.typeName, "FromJSON");
                            return (0, ts_poet_1.code) `${fromJson}(${from})`;
                        }
                        else {
                            const cstr = (0, case_1.capitalize)(valueType.toCodeString());
                            return (0, ts_poet_1.code) `${cstr}(${from})`;
                        }
                    }
                    else if ((0, types_1.isObjectId)(valueField) && options.useMongoObjectId) {
                        return (0, ts_poet_1.code) `${utils.fromJsonObjectId}(${from})`;
                    }
                    else if ((0, types_1.isTimestamp)(valueField) && options.useDate === options_1.DateOption.STRING) {
                        return (0, ts_poet_1.code) `String(${from})`;
                    }
                    else if ((0, types_1.isTimestamp)(valueField) &&
                        (options.useDate === options_1.DateOption.DATE || options.useDate === options_1.DateOption.TIMESTAMP)) {
                        return (0, ts_poet_1.code) `${utils.fromJsonTimestamp}(${from})`;
                    }
                    else if ((0, types_1.isValueType)(ctx, valueField)) {
                        return (0, ts_poet_1.code) `${from} as ${valueType}`;
                    }
                    else if ((0, types_1.isAnyValueType)(valueField)) {
                        return (0, ts_poet_1.code) `${from}`;
                    }
                    else {
                        return (0, ts_poet_1.code) `${valueType}.fromJSON(${from})`;
                    }
                }
                else {
                    const type = (0, types_1.basicTypeName)(ctx, field);
                    return (0, ts_poet_1.code) `${type}.fromJSON(${from})`;
                }
            }
            else {
                throw new Error(`Unhandled field ${field}`);
            }
        };
        // and then use the snippet to handle repeated fields if necessary
        if ((_a = canonicalFromJson[fullTypeName]) === null || _a === void 0 ? void 0 : _a[fieldName]) {
            chunks.push((0, ts_poet_1.code) `${fieldName}: ${canonicalFromJson[fullTypeName][fieldName]("object")},`);
        }
        else if ((0, types_1.isRepeated)(field)) {
            if ((0, types_1.isMapType)(ctx, messageDesc, field)) {
                const fieldType = (0, types_1.toTypeName)(ctx, messageDesc, field);
                const i = maybeCastToNumber(ctx, messageDesc, field, "key");
                if (ctx.options.useMapType) {
                    chunks.push((0, ts_poet_1.code) `
            ${fieldName}: ${ctx.utils.isObject}(${jsonProperty})
              ? Object.entries(${jsonProperty}).reduce<${fieldType}>((acc, [key, value]) => {
                  acc.set(${i}, ${readSnippet("value")});
                  return acc;
                }, new Map())
              : new Map(),
          `);
                }
                else {
                    chunks.push((0, ts_poet_1.code) `
            ${fieldName}: ${ctx.utils.isObject}(${jsonProperty})
              ? Object.entries(${jsonProperty}).reduce<${fieldType}>((acc, [key, value]) => {
                  acc[${i}] = ${readSnippet("value")};
                  return acc;
                }, {})
              : {},
          `);
                }
            }
            else {
                const readValueSnippet = readSnippet("e");
                if (readValueSnippet.toString() === (0, ts_poet_1.code) `e`.toString()) {
                    chunks.push((0, ts_poet_1.code) `${fieldName}: Array.isArray(${jsonPropertyOptional}) ? [...${jsonProperty}] : [],`);
                }
                else {
                    // Explicit `any` type required to make TS with noImplicitAny happy. `object` is also `any` here.
                    chunks.push((0, ts_poet_1.code) `
            ${fieldName}: Array.isArray(${jsonPropertyOptional}) ? ${jsonProperty}.map((e: any) => ${readValueSnippet}): [],
          `);
                }
            }
        }
        else if ((0, types_1.isWithinOneOfThatShouldBeUnion)(options, field)) {
            const cases = oneofFieldsCases[field.oneofIndex];
            const firstCase = cases[0];
            const lastCase = cases[cases.length - 1];
            if (field === firstCase) {
                const fieldName = (0, case_1.maybeSnakeToCamel)(messageDesc.oneofDecl[field.oneofIndex].name, options);
                chunks.push((0, ts_poet_1.code) `${fieldName}: `);
            }
            const ternaryIf = (0, ts_poet_1.code) `${ctx.utils.isSet}(${jsonProperty})`;
            const ternaryThen = (0, ts_poet_1.code) `{ $case: '${fieldName}', ${fieldName}: ${readSnippet(`${jsonProperty}`)}`;
            chunks.push((0, ts_poet_1.code) `${ternaryIf} ? ${ternaryThen}} : `);
            if (field === lastCase) {
                chunks.push((0, ts_poet_1.code) `undefined,`);
            }
        }
        else if ((0, types_1.isAnyValueType)(field)) {
            chunks.push((0, ts_poet_1.code) `${fieldName}: ${ctx.utils.isSet}(${jsonPropertyOptional})
        ? ${readSnippet(`${jsonProperty}`)}
        : undefined,
      `);
        }
        else if ((0, types_1.isStructType)(field)) {
            chunks.push((0, ts_poet_1.code) `${fieldName}: ${ctx.utils.isObject}(${jsonProperty})
          ? ${readSnippet(`${jsonProperty}`)}
          : undefined,`);
        }
        else if ((0, types_1.isListValueType)(field)) {
            chunks.push((0, ts_poet_1.code) `
        ${fieldName}: Array.isArray(${jsonProperty})
          ? ${readSnippet(`${jsonProperty}`)}
          : undefined,
      `);
        }
        else {
            const fallback = (0, types_1.isWithinOneOf)(field) ? "undefined" : (0, types_1.defaultValue)(ctx, field);
            chunks.push((0, ts_poet_1.code) `
        ${fieldName}: ${ctx.utils.isSet}(${jsonProperty})
          ? ${readSnippet(`${jsonProperty}`)}
          : ${fallback},
      `);
        }
    });
    // and then wrap up the switch/while/return
    chunks.push((0, ts_poet_1.code) `};`);
    chunks.push((0, ts_poet_1.code) `}`);
    return (0, ts_poet_1.joinCode)(chunks, { on: "\n" });
}
function generateCanonicalToJson(fullName, fullProtobufTypeName) {
    if ((0, types_1.isFieldMaskTypeName)(fullProtobufTypeName)) {
        return (0, ts_poet_1.code) `
    toJSON(message: ${fullName}): string {
      return message.paths.join(',');
    }
  `;
    }
    return undefined;
}
function generateToJson(ctx, fullName, fullProtobufTypeName, messageDesc) {
    const { options, utils, typeMap } = ctx;
    const chunks = [];
    const canonicalToJson = generateCanonicalToJson(fullName, fullProtobufTypeName);
    if (canonicalToJson) {
        chunks.push(canonicalToJson);
        return (0, ts_poet_1.joinCode)(chunks, { on: "\n" });
    }
    // create the basic function declaration
    chunks.push((0, ts_poet_1.code) `
    toJSON(${messageDesc.field.length > 0 ? "message" : "_"}: ${fullName}): unknown {
      const obj: any = {};
  `);
    // then add a case for each field
    messageDesc.field.forEach((field) => {
        const fieldName = (0, case_1.maybeSnakeToCamel)(field.name, options);
        const jsonName = (0, utils_1.getFieldJsonName)(field, options);
        const jsonProperty = (0, utils_1.getPropertyAccessor)("obj", jsonName);
        const readSnippet = (from) => {
            if ((0, types_1.isEnum)(field)) {
                const toJson = (0, types_1.getEnumMethod)(ctx, field.typeName, "ToJSON");
                return (0, types_1.isWithinOneOf)(field)
                    ? (0, ts_poet_1.code) `${from} !== undefined ? ${toJson}(${from}) : undefined`
                    : (0, ts_poet_1.code) `${toJson}(${from})`;
            }
            else if ((0, types_1.isObjectId)(field) && options.useMongoObjectId) {
                return (0, ts_poet_1.code) `${from}.toString()`;
            }
            else if ((0, types_1.isTimestamp)(field) && options.useDate === options_1.DateOption.DATE) {
                return (0, ts_poet_1.code) `${from}.toISOString()`;
            }
            else if ((0, types_1.isTimestamp)(field) && options.useDate === options_1.DateOption.STRING) {
                return (0, ts_poet_1.code) `${from}`;
            }
            else if ((0, types_1.isTimestamp)(field) && options.useDate === options_1.DateOption.TIMESTAMP) {
                return (0, ts_poet_1.code) `${utils.fromTimestamp}(${from}).toISOString()`;
            }
            else if ((0, types_1.isMapType)(ctx, messageDesc, field)) {
                // For map types, drill-in and then admittedly re-hard-code our per-value-type logic
                const valueType = typeMap.get(field.typeName)[2].field[1];
                if ((0, types_1.isEnum)(valueType)) {
                    const toJson = (0, types_1.getEnumMethod)(ctx, valueType.typeName, "ToJSON");
                    return (0, ts_poet_1.code) `${toJson}(${from})`;
                }
                else if ((0, types_1.isBytes)(valueType)) {
                    return (0, ts_poet_1.code) `${utils.base64FromBytes}(${from})`;
                }
                else if ((0, types_1.isObjectId)(valueType) && options.useMongoObjectId) {
                    return (0, ts_poet_1.code) `${from}.toString()`;
                }
                else if ((0, types_1.isTimestamp)(valueType) && options.useDate === options_1.DateOption.DATE) {
                    return (0, ts_poet_1.code) `${from}.toISOString()`;
                }
                else if ((0, types_1.isTimestamp)(valueType) && options.useDate === options_1.DateOption.STRING) {
                    return (0, ts_poet_1.code) `${from}`;
                }
                else if ((0, types_1.isTimestamp)(valueType) && options.useDate === options_1.DateOption.TIMESTAMP) {
                    return (0, ts_poet_1.code) `${utils.fromTimestamp}(${from}).toISOString()`;
                }
                else if ((0, types_1.isLong)(valueType) && options.forceLong === options_1.LongOption.LONG) {
                    return (0, ts_poet_1.code) `${from}.toString()`;
                }
                else if ((0, types_1.isWholeNumber)(valueType) && !((0, types_1.isLong)(valueType) && options.forceLong === options_1.LongOption.STRING)) {
                    return (0, ts_poet_1.code) `Math.round(${from})`;
                }
                else if ((0, types_1.isScalar)(valueType) || (0, types_1.isValueType)(ctx, valueType)) {
                    return (0, ts_poet_1.code) `${from}`;
                }
                else if ((0, types_1.isAnyValueType)(valueType)) {
                    return (0, ts_poet_1.code) `${from}`;
                }
                else {
                    const type = (0, types_1.basicTypeName)(ctx, valueType);
                    return (0, ts_poet_1.code) `${type}.toJSON(${from})`;
                }
            }
            else if ((0, types_1.isAnyValueType)(field)) {
                return (0, ts_poet_1.code) `${from}`;
            }
            else if ((0, types_1.isFieldMaskType)(field)) {
                const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
                return (0, ts_poet_1.code) `${type}.toJSON(${type}.wrap(${from}))`;
            }
            else if ((0, types_1.isMessage)(field) && !(0, types_1.isValueType)(ctx, field) && !(0, types_1.isMapType)(ctx, messageDesc, field)) {
                const type = (0, types_1.basicTypeName)(ctx, field, { keepValueType: true });
                return (0, ts_poet_1.code) `${from} ? ${type}.toJSON(${from}) : ${(0, types_1.defaultValue)(ctx, field)}`;
            }
            else if ((0, types_1.isBytes)(field)) {
                if ((0, types_1.isWithinOneOf)(field)) {
                    return (0, ts_poet_1.code) `${from} !== undefined ? ${utils.base64FromBytes}(${from}) : undefined`;
                }
                else {
                    return (0, ts_poet_1.code) `${utils.base64FromBytes}(${from} !== undefined ? ${from} : ${(0, types_1.defaultValue)(ctx, field)})`;
                }
            }
            else if ((0, types_1.isLong)(field) && options.forceLong === options_1.LongOption.LONG) {
                const v = (0, types_1.isWithinOneOf)(field) ? "undefined" : (0, types_1.defaultValue)(ctx, field);
                return (0, ts_poet_1.code) `(${from} || ${v}).toString()`;
            }
            else if ((0, types_1.isWholeNumber)(field) && !((0, types_1.isLong)(field) && options.forceLong === options_1.LongOption.STRING)) {
                return (0, ts_poet_1.code) `Math.round(${from})`;
            }
            else {
                return (0, ts_poet_1.code) `${from}`;
            }
        };
        if ((0, types_1.isMapType)(ctx, messageDesc, field)) {
            // Maps might need their values transformed, i.e. bytes --> base64
            if (ctx.options.useMapType) {
                chunks.push((0, ts_poet_1.code) `
          ${jsonProperty} = {};
          if (message.${fieldName}) {
            message.${fieldName}.forEach((v, k) => {
              ${jsonProperty}[k] = ${readSnippet("v")};
            });
          }
        `);
            }
            else {
                chunks.push((0, ts_poet_1.code) `
          ${jsonProperty} = {};
          if (message.${fieldName}) {
            Object.entries(message.${fieldName}).forEach(([k, v]) => {
              ${jsonProperty}[k] = ${readSnippet("v")};
            });
          }
        `);
            }
        }
        else if ((0, types_1.isRepeated)(field)) {
            // Arrays might need their elements transformed
            chunks.push((0, ts_poet_1.code) `
        if (message.${fieldName}) {
          ${jsonProperty} = message.${fieldName}.map(e => ${readSnippet("e")});
        } else {
          ${jsonProperty} = [];
        }
      `);
        }
        else if ((0, types_1.isWithinOneOfThatShouldBeUnion)(options, field)) {
            // oneofs in a union are only output as `oneof name = ...`
            const oneofName = (0, case_1.maybeSnakeToCamel)(messageDesc.oneofDecl[field.oneofIndex].name, options);
            const v = readSnippet(`message.${oneofName}?.${fieldName}`);
            chunks.push((0, ts_poet_1.code) `message.${oneofName}?.$case === '${fieldName}' && (${jsonProperty} = ${v});`);
        }
        else {
            const v = readSnippet(`message.${fieldName}`);
            chunks.push((0, ts_poet_1.code) `message.${fieldName} !== undefined && (${jsonProperty} = ${v});`);
        }
    });
    chunks.push((0, ts_poet_1.code) `return obj;`);
    chunks.push((0, ts_poet_1.code) `}`);
    return (0, ts_poet_1.joinCode)(chunks, { on: "\n" });
}
function generateFromPartial(ctx, fullName, messageDesc) {
    const { options, utils, typeMap } = ctx;
    const chunks = [];
    // create the basic function declaration
    const paramName = messageDesc.field.length > 0 ? "object" : "_";
    if (ctx.options.useExactTypes) {
        chunks.push((0, ts_poet_1.code) `
      fromPartial<I extends ${utils.Exact}<${utils.DeepPartial}<${fullName}>, I>>(${paramName}: I): ${fullName} {
    `);
    }
    else {
        chunks.push((0, ts_poet_1.code) `
      fromPartial(${paramName}: ${utils.DeepPartial}<${fullName}>): ${fullName} {
    `);
    }
    let createBase = (0, ts_poet_1.code) `createBase${fullName}()`;
    if (options.usePrototypeForDefaults) {
        createBase = (0, ts_poet_1.code) `Object.create(${createBase}) as ${fullName}`;
    }
    chunks.push((0, ts_poet_1.code) `const message = ${createBase}${maybeAsAny(options)};`);
    // add a check for each incoming field
    messageDesc.field.forEach((field) => {
        const fieldName = (0, case_1.maybeSnakeToCamel)(field.name, options);
        const readSnippet = (from) => {
            if (((0, types_1.isLong)(field) || (0, types_1.isLongValueType)(field)) && options.forceLong === options_1.LongOption.LONG) {
                return (0, ts_poet_1.code) `Long.fromValue(${from})`;
            }
            else if ((0, types_1.isObjectId)(field) && options.useMongoObjectId) {
                return (0, ts_poet_1.code) `${from} as mongodb.ObjectId`;
            }
            else if ((0, types_1.isPrimitive)(field) ||
                ((0, types_1.isTimestamp)(field) && (options.useDate === options_1.DateOption.DATE || options.useDate === options_1.DateOption.STRING)) ||
                (0, types_1.isValueType)(ctx, field)) {
                return (0, ts_poet_1.code) `${from}`;
            }
            else if ((0, types_1.isMessage)(field)) {
                if ((0, types_1.isRepeated)(field) && (0, types_1.isMapType)(ctx, messageDesc, field)) {
                    const { valueField, valueType } = (0, types_1.detectMapType)(ctx, messageDesc, field);
                    if ((0, types_1.isPrimitive)(valueField)) {
                        if ((0, types_1.isBytes)(valueField)) {
                            return (0, ts_poet_1.code) `${from}`;
                        }
                        else if ((0, types_1.isEnum)(valueField)) {
                            return (0, ts_poet_1.code) `${from} as ${valueType}`;
                        }
                        else if ((0, types_1.isLong)(valueField) && options.forceLong === options_1.LongOption.LONG) {
                            return (0, ts_poet_1.code) `Long.fromValue(${from})`;
                        }
                        else {
                            const cstr = (0, case_1.capitalize)(valueType.toCodeString());
                            return (0, ts_poet_1.code) `${cstr}(${from})`;
                        }
                    }
                    else if ((0, types_1.isAnyValueType)(valueField)) {
                        return (0, ts_poet_1.code) `${from}`;
                    }
                    else if ((0, types_1.isObjectId)(valueField) && options.useMongoObjectId) {
                        return (0, ts_poet_1.code) `${from} as mongodb.ObjectId`;
                    }
                    else if ((0, types_1.isTimestamp)(valueField) &&
                        (options.useDate === options_1.DateOption.DATE || options.useDate === options_1.DateOption.STRING)) {
                        return (0, ts_poet_1.code) `${from}`;
                    }
                    else if ((0, types_1.isValueType)(ctx, valueField)) {
                        return (0, ts_poet_1.code) `${from}`;
                    }
                    else {
                        const type = (0, types_1.basicTypeName)(ctx, valueField);
                        return (0, ts_poet_1.code) `${type}.fromPartial(${from})`;
                    }
                }
                else if ((0, types_1.isAnyValueType)(field)) {
                    return (0, ts_poet_1.code) `${from}`;
                }
                else {
                    const type = (0, types_1.basicTypeName)(ctx, field);
                    return (0, ts_poet_1.code) `${type}.fromPartial(${from})`;
                }
            }
            else {
                throw new Error(`Unhandled field ${field}`);
            }
        };
        // and then use the snippet to handle repeated fields if necessary
        if ((0, types_1.isRepeated)(field)) {
            if ((0, types_1.isMapType)(ctx, messageDesc, field)) {
                const fieldType = (0, types_1.toTypeName)(ctx, messageDesc, field);
                const i = maybeCastToNumber(ctx, messageDesc, field, "key");
                if (ctx.options.useMapType) {
                    chunks.push((0, ts_poet_1.code) `
            message.${fieldName} = (() => {
              const m = new Map();
              (object.${fieldName} as ${fieldType} ?? new Map()).forEach((value, key) => {
                if (value !== undefined) {
                  m.set(${i}, ${readSnippet("value")});
                }
              });
              return m;
            })();
          `);
                }
                else {
                    chunks.push((0, ts_poet_1.code) `
            message.${fieldName} = Object.entries(object.${fieldName} ?? {}).reduce<${fieldType}>((acc, [key, value]) => {
              if (value !== undefined) {
                acc[${i}] = ${readSnippet("value")};
              }
              return acc;
            }, {});
          `);
                }
            }
            else {
                chunks.push((0, ts_poet_1.code) `
          message.${fieldName} = object.${fieldName}?.map((e) => ${readSnippet("e")}) || [];
        `);
            }
        }
        else if ((0, types_1.isWithinOneOfThatShouldBeUnion)(options, field)) {
            let oneofName = (0, case_1.maybeSnakeToCamel)(messageDesc.oneofDecl[field.oneofIndex].name, options);
            const v = readSnippet(`object.${oneofName}.${fieldName}`);
            chunks.push((0, ts_poet_1.code) `
        if (
          object.${oneofName}?.$case === '${fieldName}'
          && object.${oneofName}?.${fieldName} !== undefined
          && object.${oneofName}?.${fieldName} !== null
        ) {
          message.${oneofName} = { $case: '${fieldName}', ${fieldName}: ${v} };
        }
      `);
        }
        else if (readSnippet(`x`).toCodeString() == "x") {
            // An optimized case of the else below that works when `readSnippet` returns the plain input
            const fallback = (0, types_1.isWithinOneOf)(field) ? "undefined" : (0, types_1.defaultValue)(ctx, field);
            chunks.push((0, ts_poet_1.code) `message.${fieldName} = object.${fieldName} ?? ${fallback};`);
        }
        else {
            const fallback = (0, types_1.isWithinOneOf)(field) ? "undefined" : (0, types_1.defaultValue)(ctx, field);
            chunks.push((0, ts_poet_1.code) `
        message.${fieldName} = (object.${fieldName} !== undefined && object.${fieldName} !== null)
          ? ${readSnippet(`object.${fieldName}`)}
          : ${fallback};
      `);
        }
    });
    // and then wrap up the switch/while/return
    chunks.push((0, ts_poet_1.code) `return message;`);
    chunks.push((0, ts_poet_1.code) `}`);
    return (0, ts_poet_1.joinCode)(chunks, { on: "\n" });
}
function generateWrap(ctx, fullProtoTypeName, fieldNames) {
    const chunks = [];
    if ((0, types_1.isStructTypeName)(fullProtoTypeName)) {
        chunks.push((0, ts_poet_1.code) `wrap(object: {[key: string]: any} | undefined): Struct {
      const struct = createBaseStruct();
      if (object !== undefined) {
        Object.keys(object).forEach(key => {
          struct.fields[key] = object[key];
        });
      }
      return struct;
    }`);
    }
    if ((0, types_1.isAnyValueTypeName)(fullProtoTypeName)) {
        if (ctx.options.oneof === options_1.OneofOption.UNIONS) {
            chunks.push((0, ts_poet_1.code) `wrap(value: any): Value {
        const result = createBaseValue()${maybeAsAny(ctx.options)};

        if (value === null) {
          result.kind = {$case: '${fieldNames.nullValue}', ${fieldNames.nullValue}: NullValue.NULL_VALUE};
        } else if (typeof value === 'boolean') {
          result.kind = {$case: '${fieldNames.boolValue}', ${fieldNames.boolValue}: value};
        } else if (typeof value === 'number') {
          result.kind = {$case: '${fieldNames.numberValue}', ${fieldNames.numberValue}: value};
        } else if (typeof value === 'string') {
          result.kind = {$case: '${fieldNames.stringValue}', ${fieldNames.stringValue}: value};
        } else if (Array.isArray(value)) {
          result.kind = {$case: '${fieldNames.listValue}', ${fieldNames.listValue}: value};
        } else if (typeof value === 'object') {
          result.kind = {$case: '${fieldNames.structValue}', ${fieldNames.structValue}: value};
        } else if (typeof value !== 'undefined') {
          throw new Error('Unsupported any value type: ' + typeof value);
        }

        return result;
    }`);
        }
        else {
            chunks.push((0, ts_poet_1.code) `wrap(value: any): Value {
        const result = createBaseValue()${maybeAsAny(ctx.options)};

        if (value === null) {
          result.${fieldNames.nullValue} = NullValue.NULL_VALUE;
        } else if (typeof value === 'boolean') {
          result.${fieldNames.boolValue} = value;
        } else if (typeof value === 'number') {
          result.${fieldNames.numberValue} = value;
        } else if (typeof value === 'string') {
          result.${fieldNames.stringValue} = value;
        } else if (Array.isArray(value)) {
          result.${fieldNames.listValue} = value;
        } else if (typeof value === 'object') {
          result.${fieldNames.structValue} = value;
        } else if (typeof value !== 'undefined') {
          throw new Error('Unsupported any value type: ' + typeof value);
        }

        return result;
    }`);
        }
    }
    if ((0, types_1.isListValueTypeName)(fullProtoTypeName)) {
        chunks.push((0, ts_poet_1.code) `wrap(value: ${ctx.options.useReadonlyTypes ? "ReadonlyArray<any>" : "Array<any>"} | undefined): ListValue {
      const result = createBaseListValue()${maybeAsAny(ctx.options)};

      result.values = value ?? [];

      return result;
    }`);
    }
    if ((0, types_1.isFieldMaskTypeName)(fullProtoTypeName)) {
        chunks.push((0, ts_poet_1.code) `wrap(paths: ${maybeReadonly(ctx.options)} string[]): FieldMask {
      const result = createBaseFieldMask()${maybeAsAny(ctx.options)};

      result.paths = paths;

      return result;
    }`);
    }
    return chunks;
}
function generateUnwrap(ctx, fullProtoTypeName, fieldNames) {
    const chunks = [];
    if ((0, types_1.isStructTypeName)(fullProtoTypeName)) {
        chunks.push((0, ts_poet_1.code) `unwrap(message: Struct): {[key: string]: any} {
      const object: { [key: string]: any } = {};
      Object.keys(message.fields).forEach(key => {
        object[key] = message.fields[key];
      });
      return object;
    }`);
    }
    if ((0, types_1.isAnyValueTypeName)(fullProtoTypeName)) {
        if (ctx.options.oneof === options_1.OneofOption.UNIONS) {
            chunks.push((0, ts_poet_1.code) `unwrap(message: Value): string | number | boolean | Object | null | Array<any> | undefined {
        if (message.kind?.$case === '${fieldNames.nullValue}') {
          return null;
        } else if (message.kind?.$case === '${fieldNames.numberValue}') {
          return message.kind?.${fieldNames.numberValue};
        } else if (message.kind?.$case === '${fieldNames.stringValue}') {
          return message.kind?.${fieldNames.stringValue};
        } else if (message.kind?.$case === '${fieldNames.boolValue}') {
          return message.kind?.${fieldNames.boolValue};
        } else if (message.kind?.$case === '${fieldNames.structValue}') {
          return message.kind?.${fieldNames.structValue};
        } else if (message.kind?.$case === '${fieldNames.listValue}') {
          return message.kind?.${fieldNames.listValue};
        } else {
          return undefined;
        }
    }`);
        }
        else {
            chunks.push((0, ts_poet_1.code) `unwrap(message: Value): string | number | boolean | Object | null | Array<any> | undefined {
      if (message?.${fieldNames.stringValue} !== undefined) {
        return message.${fieldNames.stringValue};
      } else if (message?.${fieldNames.numberValue} !== undefined) {
        return message.${fieldNames.numberValue};
      } else if (message?.${fieldNames.boolValue} !== undefined) {
        return message.${fieldNames.boolValue};
      } else if (message?.${fieldNames.structValue} !== undefined) {
        return message.${fieldNames.structValue};
      } else if (message?.${fieldNames.listValue} !== undefined) {
          return message.${fieldNames.listValue};
      } else if (message?.${fieldNames.nullValue} !== undefined) {
        return null;
      }
      return undefined;
    }`);
        }
    }
    if ((0, types_1.isListValueTypeName)(fullProtoTypeName)) {
        chunks.push((0, ts_poet_1.code) `unwrap(message: ${ctx.options.useReadonlyTypes ? "any" : "ListValue"}): Array<any> {
      return message.values;
    }`);
    }
    if ((0, types_1.isFieldMaskTypeName)(fullProtoTypeName)) {
        chunks.push((0, ts_poet_1.code) `unwrap(message: ${ctx.options.useReadonlyTypes ? "any" : "FieldMask"}): string[] {
      return message.paths;
    }`);
    }
    return chunks;
}
exports.contextTypeVar = "Context extends DataLoaders";
function maybeCastToNumber(ctx, messageDesc, field, variableName) {
    const { keyType } = (0, types_1.detectMapType)(ctx, messageDesc, field);
    if (keyType.toCodeString() === "string") {
        return variableName;
    }
    else {
        return `Number(${variableName})`;
    }
}
function maybeReadonly(options) {
    return options.useReadonlyTypes ? "readonly " : "";
}
function maybeAsAny(options) {
    return options.useReadonlyTypes ? " as any" : "";
}
