import { z } from 'zod';
/** PostgreSQL char_length counts Unicode code points, not UTF-16 units or graphemes. */
const text = (limit: number) => z.string().refine(value => {
  const characters = Array.from(value);
  return characters.length <= limit && characters.every(char => {
    const code = char.codePointAt(0)!;
    return code !== 0 && !(code >= 0xd800 && code <= 0xdfff);
  });
});
export const noteSchema = text(300);
export const commentSchema = text(100);
