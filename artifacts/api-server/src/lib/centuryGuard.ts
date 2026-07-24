/**
 * Century boundary minute guard for TimeNation.
 *
 * A minute is Non-Transferable State Property if it is:
 *   • The FIRST minute of a century: year % 100 === 1, Jan 1, 00:00
 *     Examples: 0001-01-01 00:00 (coord 000101010000)
 *               1901-01-01 00:00 (coord 190101010000)
 *               2001-01-01 00:00 (coord 200101010000)
 *   • The LAST minute of a century: year % 100 === 0, Dec 31, 23:59
 *     Examples: 0100-12-31 23:59 (coord 010012312359)
 *               2000-12-31 23:59 (coord 200012312359)
 *               2100-12-31 23:59 (coord 210012312359)
 *
 * @param coord 12-digit string YYYYMMDDHHmm
 */
export function isCenturyBoundaryMinute(coord: string): boolean {
  if (!coord || coord.length !== 12 || !/^\d{12}$/.test(coord)) return false;

  const year   = parseInt(coord.slice(0, 4), 10);
  const month  = parseInt(coord.slice(4, 6), 10);
  const day    = parseInt(coord.slice(6, 8), 10);
  const hour   = parseInt(coord.slice(8, 10), 10);
  const minute = parseInt(coord.slice(10, 12), 10);

  // First minute of a century (year % 100 === 1, or year === 1 for the very first)
  const isFirstOfCentury =
    year % 100 === 1 &&
    month  === 1  &&
    day    === 1  &&
    hour   === 0  &&
    minute === 0;

  // Last minute of a century (year % 100 === 0)
  const isLastOfCentury =
    year % 100 === 0 &&
    year > 0 &&
    month  === 12 &&
    day    === 31 &&
    hour   === 23 &&
    minute === 59;

  return isFirstOfCentury || isLastOfCentury;
}

export const CENTURY_STATE_PROPERTY_CODE = "CENTURY_STATE_PROPERTY";
export const CENTURY_STATE_PROPERTY_MSG  =
  "Эта минута является неотчуждаемой государственной собственностью TimeNation.";
