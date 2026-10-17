const THAI = /[฀-๿]/;

export function queryLang(q: string): 'th' | 'en' {
  return THAI.test(q) ? 'th' : 'en';
}
