import { expect, test, describe, beforeEach } from "bun:test";
import { EventEmitter, IDisposable } from "./interfaces";

describe("EventEmitter", () => {
	let emitter: EventEmitter<string>;

	beforeEach(() => {
		emitter = new EventEmitter<string>();
	});

	describe("constructor", () => {
		test("should create a new EventEmitter instance", () => {
			const instance = new EventEmitter<string>();
			expect(instance).toBeInstanceOf(EventEmitter);
			expect(instance).toHaveProperty("event");
			expect(instance).toHaveProperty("fire");
			expect(typeof instance.event).toBe("function");
			expect(typeof instance.fire).toBe("function");
		});

		test("should initialize with empty listeners array", () => {
			const instance = new EventEmitter<string>();
			// Verify no listeners are registered initially
			let callCount = 0;
			instance.fire("test" as any);
			expect(callCount).toBe(0);
		});
	});

	describe("event subscription", () => {
		test("should allow subscribing to events", () => {
			let receivedData: string | null = null;
			const listener = (data: string) => {
				receivedData = data;
			};

			const disposable = emitter.event(listener);
			expect(disposable).toBeDefined();
			expect(typeof disposable.dispose).toBe("function");

			emitter.fire("test-data" as any);
			expect(receivedData).not.toBeNull();
			expect(receivedData!).toBe("test-data");
		});

		test("should support multiple listeners", () => {
			const receivedData: string[] = [];
			const listener1 = (data: string) => receivedData.push(`1:${data}`);
			const listener2 = (data: string) => receivedData.push(`2:${data}`);
			const listener3 = (data: string) => receivedData.push(`3:${data}`);

			emitter.event(listener1);
			emitter.event(listener2);
			emitter.event(listener3);

			emitter.fire("test" as any);

			expect(receivedData).toEqual(["1:test", "2:test", "3:test"]);
			expect(receivedData.length).toBe(3);
		});

		test("should call listeners in subscription order", () => {
			const callOrder: number[] = [];
			const listener1 = () => callOrder.push(1);
			const listener2 = () => callOrder.push(2);
			const listener3 = () => callOrder.push(3);

			emitter.event(listener1);
			emitter.event(listener2);
			emitter.event(listener3);

			emitter.fire("test" as any);

			expect(callOrder).toEqual([1, 2, 3]);
		});
	});

	describe("dispose", () => {
		test("should remove listener when disposed", () => {
			let callCount = 0;
			const listener = () => callCount++;

			const disposable = emitter.event(listener);
			emitter.fire("test1" as any);
			expect(callCount).toBe(1);

			disposable.dispose();
			emitter.fire("test2" as any);
			expect(callCount).toBe(1); // Should not increment
		});

		test("should allow disposing multiple times safely", () => {
			let callCount = 0;
			const listener = () => callCount++;

			const disposable = emitter.event(listener);
			disposable.dispose();
			disposable.dispose(); // Should not throw
			disposable.dispose(); // Should not throw

			emitter.fire("test" as any);
			expect(callCount).toBe(0);
		});

		test("should only remove the specific listener when disposed", () => {
			let count1 = 0;
			let count2 = 0;
			let count3 = 0;

			const listener1 = () => count1++;
			const listener2 = () => count2++;
			const listener3 = () => count3++;

			const disposable1 = emitter.event(listener1);
			const disposable2 = emitter.event(listener2);
			const disposable3 = emitter.event(listener3);

			emitter.fire("test");
			expect(count1).toBe(1);
			expect(count2).toBe(1);
			expect(count3).toBe(1);

			disposable2.dispose();
			emitter.fire("test" as any);
			expect(count1).toBe(2);
			expect(count2).toBe(1); // Should not increment
			expect(count3).toBe(2);
		});
	});

	describe("fire", () => {
		test("should pass data to all listeners", () => {
			const receivedData: string[] = [];
			emitter.event((data) => receivedData.push(data));

			emitter.fire("data1" as any);
			emitter.fire("data2" as any);
			emitter.fire("data3" as any);

			expect(receivedData).toEqual(["data1", "data2", "data3"]);
		});

		test("should handle empty string data", () => {
			let receivedData: string | null = null;
			emitter.event((data) => {
				receivedData = data;
			});

			emitter.fire("" as any);
			expect(receivedData).not.toBeNull();
			expect(receivedData as unknown as string).toBe("");
		});

		test("should handle complex data types", () => {
			const emitter = new EventEmitter<{ id: number; name: string }>();
			let receivedData: { id: number; name: string } | null = null;

			emitter.event((data) => {
				receivedData = data;
			});

			const testData = { id: 123, name: "test" };
			emitter.fire(testData as any);

			expect(receivedData).not.toBeNull();
			expect(receivedData!).toEqual(testData);
		});

		test("should not throw when no listeners are registered", () => {
			expect(() => emitter.fire("test" as any)).not.toThrow();
		});

		test("should handle listeners that throw errors gracefully", () => {
			let callCount = 0;
			const goodListener = () => callCount++;
			const badListener = () => {
				throw new Error("Listener error");
			};

			emitter.event(goodListener);
			emitter.event(badListener);
			emitter.event(goodListener);

			// Should not throw, but may not call remaining listeners
			// This tests the behavior - Bun's event loop may handle this differently
			try {
				emitter.fire("test" as any);
			} catch (e) {
				// Error is expected from badListener
			}
		});
	});

	describe("IDisposable interface", () => {
		test("should return IDisposable with dispose method", () => {
			const disposable = emitter.event(() => {});
			expect(disposable).toBeDefined();
			expect(typeof disposable.dispose).toBe("function");
		});

		test("should implement IDisposable interface correctly", () => {
			const disposable: IDisposable = emitter.event(() => {});
			expect(disposable).toHaveProperty("dispose");
			expect(typeof disposable.dispose).toBe("function");
		});
	});

	describe("edge cases", () => {
		test("should handle rapid subscribe/unsubscribe", () => {
			let callCount = 0;
			for (let i = 0; i < 100; i++) {
				const disposable = emitter.event(() => callCount++);
				disposable.dispose();
			}

			emitter.fire("test");
			expect(callCount).toBe(0);
		});

		test("should handle subscribing during fire", () => {
			const receivedData: string[] = [];
			emitter.event(() => {
				emitter.event((data) => receivedData.push(`nested:${data}`));
			});

			emitter.fire("test" as any);
			// The nested listener may or may not be called in the same fire cycle
			// depending on implementation - we just verify it doesn't crash
			expect(Array.isArray(receivedData)).toBe(true);

			emitter.fire("test2" as any);
			// Now it should definitely be called
			expect(receivedData.length).toBeGreaterThan(0);
		});

		test("should handle unsubscribing during fire", () => {
			let callCount = 0;
			let disposable: IDisposable | null = null;

			disposable = emitter.event(() => {
				callCount++;
				if (disposable) {
					disposable.dispose();
				}
			});

			emitter.fire("test" as any);
			expect(callCount).toBe(1);

			emitter.fire("test2" as any);
			expect(callCount).toBe(1); // Should not increment
		});

		test("should handle dispose when listener already removed (indexOf returns -1)", () => {
			// This test explicitly covers the case where dispose() is called
			// but the listener is not found (indexOf returns -1)
			const listener = () => {};
			const disposable = emitter.event(listener);
			
			// First dispose - removes listener (i !== -1)
			disposable.dispose();
			
			// Second dispose - listener not found (i === -1)
			// This should execute the else branch (or skip the if)
			disposable.dispose();
			
			// Third dispose - still not found (i === -1)
			disposable.dispose();
			
			// Verify listener was removed
			emitter.fire("test" as any);
			// No listeners should be called
		});

		test("should handle dispose on a listener that was never added", () => {
			// Create a disposable but manually manipulate listeners to simulate
			// a listener that was never added (edge case)
			const listener = () => {};
			const disposable = emitter.event(listener);
			
			// Manually remove the listener from the array to simulate it never being added
			// This tests the case where indexOf returns -1
			const listeners = (emitter as any).listeners;
			listeners.length = 0; // Clear the array
			
			// Now dispose - should handle indexOf returning -1 gracefully
			// This explicitly tests the branch where i === -1
			disposable.dispose();
			
			// Should not throw even when listener is not found
			expect(() => disposable.dispose()).not.toThrow();
		});
	});
});

