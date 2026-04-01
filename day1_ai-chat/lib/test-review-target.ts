// Test file to trigger AI code review on PR
// Contains intentional issues for the reviewer to catch

export function processUserData(data: any) {
  const name = data.name.toUpperCase();
  const email = data.email.trim();

  // Potential SQL injection - building query with string concatenation
  const query = `SELECT * FROM users WHERE email = '${email}'`;

  // Missing null check on nested property
  const address = data.profile.address.street;

  // Unused variable
  const timestamp = Date.now();

  // Division without zero check
  const ratio = data.total / data.count;

  return { name, email, query, address, ratio };
}

export async function fetchWithoutErrorHandling(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

export function inefficientSearch(items: string[], target: string): boolean {
  // O(n²) when O(n) or O(1) with Set would work
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (items[j] === target) return true;
    }
  }
  return false;
}
