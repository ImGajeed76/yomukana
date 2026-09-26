// naughty-words ships plain JSON lists with no types: language code to words.
declare module "naughty-words" {
  const lists: Readonly<Record<string, readonly string[]>>;
  export default lists;
}
