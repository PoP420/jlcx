function calculateLoanDetails(principal, termMonths, isQualifiedForRebate, prevBalance = 0, advPayment = 0, passbookFee = 0, releaseDateStr) {
    const interestRate = 0.10;
    const processingFeeRate = 0.05;
    const rebateRate = 0.02;
    const daysPerMonth = 30;

    const interest = principal * interestRate * termMonths;
    const totalDue = principal + interest;
    
    const processingFee = principal * processingFeeRate;
    const rebateAmount = isQualifiedForRebate ? (principal * rebateRate) : 0;
    
    const netProceeds = principal - processingFee + rebateAmount - prevBalance + advPayment - passbookFee;
    
    const totalDays = termMonths * daysPerMonth;
    const dailyPayment = totalDue / totalDays;

    // Date calculation
    const releaseDate = new Date(releaseDateStr);
    const maturityDate = new Date(releaseDate);
    maturityDate.setMonth(maturityDate.getMonth() + termMonths);

    return {
        principal,
        termMonths,
        interest,
        totalDue,
        releaseDate: releaseDate.toISOString().split('T')[0],
        maturityDate: maturityDate.toISOString().split('T')[0],
        processingFee,
        rebateAmount,
        netProceeds,
        dailyPayment,
        totalDays
    };
}

// Example Usage:
const result = calculateLoanDetails(10000, 2, false, 0, 0, 0, '2026-10-06');
console.log(result);