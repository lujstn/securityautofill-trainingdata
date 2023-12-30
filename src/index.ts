import puppeteerExtra from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import { fetchMessages } from '@fetchMessages'
import { fetchPhoneNumbers } from '@fetchPhoneNumbers'
import { fetchCountries } from '@fetchCountries'

/*
 * This project scrapes the website https://quackr.io/ for texts made to temporary phone numbers,
 * because these are often OTP codes - meaning we can use these as training data. We fetch all available
 * countries, then fetch all available phone numbers for each country, then fetch all available messages,
 * and persist them to a CSV file.
 */
puppeteerExtra.use(Stealth())
;(async () => {
  // Fetch countries from separate function
  const countries = await fetchCountries()
  console.log(`${countries.length} countries identified`)

  // Fetch phone numbers from separate function
  const flattenedPhoneNumbers = await fetchPhoneNumbers(countries)
  console.log(`${flattenedPhoneNumbers.length} phone numbers identified`)

  // Fetch SMS messages from separate function
  const msgs = await fetchMessages(flattenedPhoneNumbers)
  console.log(`${msgs.length} SMS messages identified`)
})()
