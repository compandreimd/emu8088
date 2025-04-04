import Memory from "../../src/devices/mem/memory"
describe('CPU functionality', () => {
    let memory: Memory; // If your CPU interacts with memory, include it here

    beforeEach(() => {
        memory = new Memory(10); // Initialize memory if required
        // Perform any other setup needed for testing
    });
    test('Test Get', () => {
        expect(memory.get(0)/* some condition */).toBe(0);
        expect(memory.get(1)/* some condition */).toBe(0);
        // Add more assertions as needed
    });
    test('Test Set', () => {
        // memory[0] = 10;
        let x = Math.floor(Math.random() * 0xFF);
        memory.set(0, x);
        memory.set(1, 0x1200 + x);
        expect(memory.get(0)/* some condition */).toBe(x);
        expect(memory.get(1)/* some condition */).toBe(x);
        // expect(memory[0]/* some condition */).toBe(10);
        // Add more assertions as needed
    });

    // Add more test cases targeting different CPU functionalities
});