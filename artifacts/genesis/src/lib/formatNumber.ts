export function formatNumber(num: number): string {
  // Fractional trickles (a Fusion Chamber's 0.01 matter/sec) would floor to "0"
  // at 1 decimal, so small values keep enough places to stay visible.
  if (num > 0 && num < 1) {
    return parseFloat(num.toPrecision(2)).toString();
  }
  if (num < 1000) {
    return (Math.floor(num * 10) / 10).toString(); // Keep 1 decimal for small resources if needed
  }
  
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi"];
  const suffixNum = Math.floor(("" + Math.floor(num)).length / 3);
  
  let shortValue = parseFloat((suffixNum != 0 ? (num / Math.pow(1000, suffixNum)) : num).toPrecision(3));
  if (shortValue % 1 != 0) {
    shortValue = parseFloat(shortValue.toFixed(2));
  }
  
  if (suffixNum >= suffixes.length) {
    return num.toExponential(2);
  }
  
  return shortValue + suffixes[suffixNum];
}

export function formatWholeNumber(num: number): string {
  if (num < 1000) {
    return Math.floor(num).toString();
  }
  return formatNumber(num);
}
