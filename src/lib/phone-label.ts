export function phoneLabel(phone: string): string {
  const match = /^(\+1)?([2-9]\d{2})([2-9]\d{2})(\d{4})$/.exec(phone);
  return match ? `${match[1] ? "+1 " : ""}(${match[2]}) ${match[3]}-${match[4]}` : phone;
}
