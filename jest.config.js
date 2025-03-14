module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: [
        "<rootDir>/test"
    ],
    moduleFileExtensions: [
        "ts",
        "tsx",
        "js",
        "json"
    ],
    transform: {
        "^.+\\.(ts|tsx)$": "ts-jest"
    },
    "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.(tsx?|ts?)$",
    "modulePathIgnorePatterns": ["<rootDir>/dist/"]
};