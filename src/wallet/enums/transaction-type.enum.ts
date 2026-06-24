// Numeric enum for wallet transaction types
// 1 = DEPOSIT, 2 = WITHDRAW, 3 = TRANSFER_IN, 4 = TRANSFER_OUT
// 5 = TIP_OUT, 6 = TIP_IN, 7 = FEE, 8 = CUSTOMER_TIP_OUT, 9 = CUSTOMER_TIP_IN
export enum TransactionType {
  DEPOSIT = 1,
  WITHDRAW = 2,
  TRANSFER_IN = 3,
  TRANSFER_OUT = 4,
  TIP_OUT = 5,
  TIP_IN = 6,
  FEE = 7,
  CUSTOMER_TIP_OUT = 8,
  CUSTOMER_TIP_IN = 9,
}
