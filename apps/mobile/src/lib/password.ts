/** Shared password rules for pair + account. */
export function passwordMeetsRules(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password needs a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password needs a symbol";
  return null;
}
