export const log = (...args) => console.log(new Date().toISOString(), "-", ...args);
export const err = (...args) => console.error(new Date().toISOString(), "-", ...args);
