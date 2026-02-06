/**
 * Array Utilities for CS101 Test Assignment
 * 
 * This module provides common array operations for testing
 * the Moji-Proctor extension.
 */

/**
 * Find the maximum value in an array
 */
function findMax(arr) {
    if (arr.length === 0) {
        throw new Error("Array is empty");
    }
    return Math.max(...arr);
}

/**
 * Find the minimum value in an array
 */
function findMin(arr) {
    if (arr.length === 0) {
        throw new Error("Array is empty");
    }
    return Math.min(...arr);
}

/**
 * Calculate the sum of all elements in an array
 */
function sum(arr) {
    return arr.reduce((acc, val) => acc + val, 0);
}

/**
 * Calculate the average of all elements in an array
 */
function average(arr) {
    if (arr.length === 0) {
        throw new Error("Array is empty");
    }
    return sum(arr) / arr.length;
}

/**
 * Remove duplicates from an array
 */
function removeDuplicates(arr) {
    return [...new Set(arr)];
}

// Export functions
module.exports = {
    findMax,
    findMin,
    sum,
    average,
    removeDuplicates
};

// Test the functions if run directly
if (require.main === module) {
    const testArray = [5, 2, 8, 1, 9, 3, 7];
    console.log("Array Utilities Test");
    console.log(`Test array: [${testArray}]`);
    console.log(`Max: ${findMax(testArray)}`);
    console.log(`Min: ${findMin(testArray)}`);
    console.log(`Sum: ${sum(testArray)}`);
    console.log(`Average: ${average(testArray)}`);
    console.log(`Remove duplicates from [1, 2, 2, 3, 3, 3]: [${removeDuplicates([1, 2, 2, 3, 3, 3])}]`);
}
