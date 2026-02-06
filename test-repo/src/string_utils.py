"""
String Utilities Module for CS101 Test Assignment

This module provides string manipulation functions.
"""

def reverse_string(s):
    """Reverse a string and return it."""
    return s[::-1]

def is_palindrome(s):
    """Check if a string is a palindrome."""
    s = s.lower().replace(" ", "")
    return s == s[::-1]

def count_vowels(s):
    """Count the number of vowels in a string."""
    vowels = "aeiouAEIOU"
    count = 0
    for char in s:
        if char in vowels:
            count += 1
    return count

def capitalize_words(s):
    """Capitalize the first letter of each word."""
    return ' '.join(word.capitalize() for word in s.split())

if __name__ == "__main__":
    # Test string utilities
    print("String Utilities Test")
    test_str = "hello world"
    print(f"Original: {test_str}")
    print(f"Reversed: {reverse_string(test_str)}")
    print(f"Is palindrome: {is_palindrome(test_str)}")
    print(f"Vowel count: {count_vowels(test_str)}")
    print(f"Capitalized: {capitalize_words(test_str)}")
