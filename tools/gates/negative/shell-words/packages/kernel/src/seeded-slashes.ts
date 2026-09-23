/* A word in code after a `'//'` in a string. Two regular expressions read that string as the start
   of a line comment and blank the rest of the line, which is how `decomment` misses this one. */
export const firstLabel = (url: string) => (url.startsWith('//') ? null : url.split('.')[0] === 'mercury');
