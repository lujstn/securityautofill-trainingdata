import puppeteerExtra from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'

export async function fetchCountries() {
  // Configure puppeteer
  puppeteerExtra.use(Stealth())
  const browser = await puppeteerExtra.launch()
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  )

  // Visit the page and wait for the country buttons to load
  await page.goto('https://quackr.io/temporary-numbers')
  await page.waitForSelector('.flag-icon', { timeout: 5_000 })

  // Extract the list of countries
  const countries = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[_ngcontent-serverapp-c7]'))
      .filter(
        (e: any) =>
          e.nodeName === 'A' &&
          e.className.includes('button') &&
          e.href.includes('https://quackr.io/temporary-numbers/'),
      )
      .map((e: any) => e.href),
  )

  // Gracefully close the browser
  await browser.close()

  // Return the list of countries
  return countries
}
