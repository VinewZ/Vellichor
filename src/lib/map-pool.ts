export async function mapPool<T, R>(
	items: T[],
	size: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workerCount = Math.min(Math.max(size, 1), items.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index] as T, index);
		}
	});
	await Promise.all(workers);
	return results;
}

export function yieldToUI(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
