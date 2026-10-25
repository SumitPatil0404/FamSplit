package expo.modules.bankalerts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertFilterTest {
  private val messages = "com.google.android.apps.messaging"
  private val gpay = "com.google.android.apps.nbu.paisa.user"

  @Test
  fun keepsBankSmsAsItArrived() {
    val sms = "Sent Rs.500.00 From HDFC Bank A/C *1234 To Rahul Sharma On 24/10/26 Ref 123456789012"
    // The title of an SMS is only the sender, so it is left out.
    assertEquals(sms, AlertFilter.paymentText(messages, "VM-HDFCBK", sms))
  }

  @Test
  fun keepsAUpiAppsTitleWithItsText() {
    assertEquals("Rahul Sharma paid you ₹500", AlertFilter.paymentText(gpay, "Rahul Sharma", "paid you ₹500"))
    assertEquals("Swiggy You paid ₹410", AlertFilter.paymentText(gpay, "Swiggy", "You paid ₹410"))
  }

  @Test
  fun findsThePaymentWhenOnlyTheTitleHasIt() {
    assertEquals("₹1,250 paid to Domino's Tap to view", AlertFilter.paymentText(gpay, "₹1,250 paid to Domino's", "Tap to view"))
  }

  @Test
  fun readsAmountsWrittenInEachWay() {
    for (text in listOf(
      "INR 1200.00 debited from A/c XX1234",
      "Rs.1,200 spent on your card",
      "₹1200 received from Rahul",
      "Dear UPI user A/C X1234 debited by 500.0 on date 24Oct26",
    )) {
      assertEquals(text, AlertFilter.paymentText(messages, "AX-BANK", text))
    }
  }

  @Test
  fun dropsWhatIsNotAPaymentThatHappened() {
    for (text in listOf(
      "482913 is your OTP for txn of Rs.2500.00 at AMAZON",
      "Your verification code is 1234 for a payment of Rs 500",
      "Rahul has requested Rs.500 from you",
      "Your payment of Rs 500 to Zomato failed",
      "Rs.1,500 will be debited on 01-11-26 for Netflix",
      "Get up to ₹500 cashback on your first UPI payment",
      "You have a pre-approved loan of Rs 2,00,000. Apply now",
      "Payment of Rs 4,500 is due on 05-11-26",
      "Your A/c XX1234 balance is Rs 12,000.00",
      "Your order has been shipped",
      "",
    )) {
      assertNull(text, AlertFilter.paymentText(messages, "AX-BANK", text))
    }
  }

  @Test
  fun skipsChatAppsButNotEmailOrBankApps() {
    for (app in listOf("com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.instagram.android", "com.facebook.orca", "org.thoughtcrime.securesms")) {
      assertTrue(app, AlertFilter.isChatApp(app))
    }
    for (app in listOf(messages, gpay, "com.google.android.gm", "com.sbi.lotusintouch", "com.phonepe.app")) {
      assertFalse(app, AlertFilter.isChatApp(app))
    }
  }

  @Test
  fun treatsSmsFromAPhoneNumberAsAPerson() {
    assertTrue(AlertFilter.isFromPerson(messages, "+91 98765 43210"))
    assertTrue(AlertFilter.isFromPerson(messages, "9876543210"))
    // Senders banks use: letters, or a short code.
    assertFalse(AlertFilter.isFromPerson(messages, "VM-HDFCBK"))
    assertFalse(AlertFilter.isFromPerson(messages, "57575711"))
    // Outside an SMS app the title is not a sender at all.
    assertFalse(AlertFilter.isFromPerson(gpay, "9876543210"))
  }
}
