"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.camelCase = exports.capitalize = exports.camelToSnake = exports.snakeToCamel = exports.maybeSnakeToCamel = void 0;
/** Converts `key` to TS/JS camel-case idiom, unless overridden not to. */
function maybeSnakeToCamel(key, options) {
    if (options.snakeToCamel.includes("keys") && key.includes("_")) {
        return snakeToCamel(key);
    }
    else {
        return key;
    }
}
exports.maybeSnakeToCamel = maybeSnakeToCamel;
function snakeToCamel(s) {
    const hasLowerCase = !!s.match(/[a-z]/);
    return s
        .split("_")
        .map((word, i) => {
        // If the word is already mixed case, leave the existing case as-is
        word = hasLowerCase ? word : word.toLowerCase();
        return i === 0 ? word : capitalize(word);
    })
        .join("");
}
exports.snakeToCamel = snakeToCamel;
function camelToSnake(s) {
    return s.replace(/\w([A-Z])/g, (m) => m[0] + "_" + m[1]).toUpperCase();
}
exports.camelToSnake = camelToSnake;
function capitalize(s) {
    return s.substring(0, 1).toUpperCase() + s.substring(1);
}
exports.capitalize = capitalize;
function camelCase(s) {
    return s.substring(0, 1).toLowerCase() + s.substring(1);
}
exports.camelCase = camelCase;
