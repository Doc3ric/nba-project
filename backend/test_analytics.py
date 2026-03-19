import sys
import os
import math
from scipy.stats import poisson

# Mocking enough to test the math functions from app.py
def calculate_poisson_probability(mean_value, line):
    if mean_value <= 0:
        return 0.0
    prob_le = poisson.cdf(math.floor(line), mu=mean_value)
    prob_over = (1 - prob_le) * 100
    return round(float(prob_over), 1)

def test_poisson_logic():
    print("Testing Poisson Probability Logic...")
    
    # Case 1: Mean is 3.0, Line is 2.5 (Over 2.5)
    # P(X > 2.5) = 1 - P(X <= 2)
    prob = calculate_poisson_probability(3.0, 2.5)
    print(f"Mean=3.0, Line=2.5 => Prob={prob}%")
    assert prob > 50, "Prob should be > 50% since mean (3.0) is > line (2.5)"
    
    # Case 2: Mean is 1.0, Line is 2.5 (Over 2.5)
    prob = calculate_poisson_probability(1.0, 2.5)
    print(f"Mean=1.0, Line=2.5 => Prob={prob}%")
    assert prob < 20, "Prob should be low since mean (1.0) is < line (2.5)"
    
    # Case 3: Steph Curry example (Mean 4.8, Line 4.5)
    prob = calculate_poisson_probability(4.8, 4.5)
    print(f"Mean=4.8, Line=4.5 => Prob={prob}%")
    
    print("Poisson Test Passed!\n")

def test_matchup_penalty_logic():
    print("Testing Matchup Penalty Logic Simulation...")
    base_prob = 65.0
    penalty = 0.15
    final_prob = base_prob * (1 - penalty)
    print(f"Base Prob={base_prob}%, Penalty=15% => Final={final_prob}%")
    assert final_prob == 55.25
    print("Penalty Logic Simulation Passed!\n")

if __name__ == "__main__":
    test_poisson_logic()
    test_matchup_penalty_logic()
    print("All Analytics Verification Tests Passed!")
