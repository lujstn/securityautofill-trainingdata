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
 *
 * At the time of writing this code, neither the T&Cs or Privacy Policy of Quakr.io forbid scraping their
 * site, nor do they claim any IP rights or copyright over the data on their site. They also claim
 * "no responsibility in the content of the messages", so I believe it's fair use to collect data from
 * Quakr.io in this manner. Before using this tool, please double check any T&Cs/Privacy Policy documents
 * on their site to make sure that you are not violating any of their terms by using this tool.
 */
puppeteerExtra.use(Stealth())
;(async () => {
  // Fetch countries from separate function
  const countries = await fetchCountries()
  console.log(`${countries.length} countries identified`)

  // Fetch phone numbers from separate function
  const flattenedPhoneNumbers = await fetchPhoneNumbers(countries)
  console.log(`✅ ${flattenedPhoneNumbers.length} phone numbers identified`)

  // Fetch SMS messages from separate function
  await fetchMessages(flattenedPhoneNumbers)
})()
