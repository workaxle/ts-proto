"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTsPoetOpts = exports.optionsFromParameter = exports.defaultOptions = exports.ServiceOption = exports.RemoveEnumPrefixOption = exports.OneofOption = exports.EnvOption = exports.DateOption = exports.LongOption = void 0;
var LongOption;
(function (LongOption) {
    LongOption["NUMBER"] = "number";
    LongOption["LONG"] = "long";
    LongOption["STRING"] = "string";
})(LongOption = exports.LongOption || (exports.LongOption = {}));
var DateOption;
(function (DateOption) {
    DateOption["DATE"] = "date";
    DateOption["STRING"] = "string";
    DateOption["TIMESTAMP"] = "timestamp";
})(DateOption = exports.DateOption || (exports.DateOption = {}));
var EnvOption;
(function (EnvOption) {
    EnvOption["NODE"] = "node";
    EnvOption["BROWSER"] = "browser";
    EnvOption["BOTH"] = "both";
})(EnvOption = exports.EnvOption || (exports.EnvOption = {}));
var OneofOption;
(function (OneofOption) {
    OneofOption["PROPERTIES"] = "properties";
    OneofOption["UNIONS"] = "unions";
})(OneofOption = exports.OneofOption || (exports.OneofOption = {}));
var RemoveEnumPrefixOption;
(function (RemoveEnumPrefixOption) {
    RemoveEnumPrefixOption["ALL"] = "all";
    RemoveEnumPrefixOption["MEMBERS"] = "members";
    RemoveEnumPrefixOption["NONE"] = "none";
})(RemoveEnumPrefixOption = exports.RemoveEnumPrefixOption || (exports.RemoveEnumPrefixOption = {}));
var ServiceOption;
(function (ServiceOption) {
    ServiceOption["GRPC"] = "grpc-js";
    ServiceOption["NICE_GRPC"] = "nice-grpc";
    ServiceOption["GENERIC"] = "generic-definitions";
    ServiceOption["DEFAULT"] = "default";
    ServiceOption["NONE"] = "none";
})(ServiceOption = exports.ServiceOption || (exports.ServiceOption = {}));
function defaultOptions() {
    return {
        context: false,
        snakeToCamel: ["json", "keys"],
        forceLong: LongOption.NUMBER,
        useOptionals: "none",
        useDate: DateOption.DATE,
        useMongoObjectId: false,
        oneof: OneofOption.PROPERTIES,
        esModuleInterop: false,
        fileSuffix: "",
        importSuffix: "",
        lowerCaseServiceMethods: false,
        outputEncodeMethods: true,
        outputJsonMethods: true,
        outputPartialMethods: true,
        outputTypeRegistry: false,
        stringEnums: false,
        constEnums: false,
        removeEnumPrefix: RemoveEnumPrefixOption.NONE,
        enumsAsLiterals: false,
        outputClientImpl: true,
        outputServices: [],
        returnObservable: false,
        addGrpcMetadata: false,
        metadataType: undefined,
        addNestjsRestParameter: false,
        nestJs: false,
        env: EnvOption.BOTH,
        unrecognizedEnum: true,
        exportCommonSymbols: true,
        outputSchema: false,
        onlyTypes: false,
        emitImportedFiles: true,
        useExactTypes: true,
        useAsyncIterable: false,
        unknownFields: false,
        usePrototypeForDefaults: false,
        useJsonWireFormat: false,
        useNumericEnumForJson: false,
        initializeFieldsAsUndefined: true,
        useMapType: false,
        useReadonlyTypes: false,
        useSnakeTypeName: true,
        M: {},
    };
}
exports.defaultOptions = defaultOptions;
const nestJsOptions = {
    lowerCaseServiceMethods: true,
    outputEncodeMethods: false,
    outputJsonMethods: false,
    outputPartialMethods: false,
    outputClientImpl: false,
    useDate: DateOption.TIMESTAMP,
};
function optionsFromParameter(parameter) {
    const options = defaultOptions();
    if (parameter) {
        const parsed = parseParameter(parameter);
        if (parsed.nestJs) {
            Object.assign(options, nestJsOptions);
        }
        Object.assign(options, parsed);
    }
    // onlyTypes=true implies outputJsonMethods=false,outputEncodeMethods=false,outputClientImpl=false,nestJs=false
    if (options.onlyTypes) {
        options.outputJsonMethods = false;
        options.outputEncodeMethods = false;
        options.outputClientImpl = false;
        options.nestJs = false;
    }
    else if (!options.outputJsonMethods &&
        !options.outputEncodeMethods &&
        !options.outputClientImpl &&
        !options.nestJs) {
        options.onlyTypes = true;
    }
    // Treat forceLong=true as LONG
    if (options.forceLong === true) {
        options.forceLong = LongOption.LONG;
    }
    // Treat outputServices=false as NONE
    if (options.outputServices === false) {
        options.outputServices = [ServiceOption.NONE];
    }
    // Existing type-coercion inside parseParameter leaves a little to be desired.
    if (typeof options.outputServices == "string") {
        options.outputServices = [options.outputServices];
    }
    if (options.outputServices.length == 0) {
        options.outputServices = [ServiceOption.DEFAULT];
    }
    if (options.useDate === true) {
        // Treat useDate=true as DATE
        options.useDate = DateOption.DATE;
    }
    else if (options.useDate === false) {
        // Treat useDate=false as TIMESTAMP
        options.useDate = DateOption.TIMESTAMP;
    }
    if (options.snakeToCamel === false) {
        options.snakeToCamel = [];
    }
    else if (options.snakeToCamel === true) {
        options.snakeToCamel = ["keys", "json"];
    }
    else if (typeof options.snakeToCamel === "string") {
        options.snakeToCamel = options.snakeToCamel.split("_");
    }
    if (options.useJsonWireFormat) {
        if (!options.onlyTypes) {
            // useJsonWireFormat requires onlyTypes=true
            options.useJsonWireFormat = false;
        }
        else {
            // useJsonWireFormat implies stringEnums=true and useDate=string
            options.stringEnums = true;
            options.useDate = DateOption.STRING;
        }
    }
    if (options.nestJs) {
        options.initializeFieldsAsUndefined = false;
    }
    return options;
}
exports.optionsFromParameter = optionsFromParameter;
// A very naive parse function, eventually could/should use iots/runtypes
function parseParameter(parameter) {
    const options = { M: {} };
    parameter.split(",").forEach((param) => {
        // same as protoc-gen-go https://github.com/protocolbuffers/protobuf-go/blob/bf9455640daabb98c93b5b5e71628f3f813d57bb/compiler/protogen/protogen.go#L168-L171
        const optionSeparatorPos = param.indexOf("=");
        const key = param.substring(0, optionSeparatorPos);
        const value = parseParamValue(param.substring(optionSeparatorPos + 1));
        if (key.charAt(0) === "M") {
            if (typeof value !== "string") {
                console.warn(`ignoring invalid M option: '${param}'`);
            }
            else {
                const mKey = key.substring(1);
                if (options.M[mKey]) {
                    console.warn(`received conflicting M options: '${param}' will override 'M${mKey}=${options.M[mKey]}'`);
                }
                if (param.endsWith(".ts")) {
                    console.warn(`received M option '${param}' ending in '.ts' this is usually a mistake`);
                }
                options.M[mKey] = value;
            }
        }
        else if (options[key]) {
            options[key] = [options[key], value];
        }
        else {
            options[key] = value;
        }
    });
    return options;
}
function parseParamValue(value) {
    return value === "true" ? true : value === "false" ? false : value;
}
function getTsPoetOpts(_options) {
    const imports = ["protobufjs/minimal" + _options.importSuffix];
    return {
        prefix: `/* eslint-disable */`,
        dprintOptions: { preferSingleLine: true, lineWidth: 120 },
        ...(_options.esModuleInterop ? { forceDefaultImport: imports } : { forceModuleImport: imports }),
    };
}
exports.getTsPoetOpts = getTsPoetOpts;
