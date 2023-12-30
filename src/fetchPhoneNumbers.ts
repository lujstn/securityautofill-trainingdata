import { addExtra } from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import Recaptcha from 'puppeteer-extra-plugin-recaptcha'
import { Cluster } from 'puppeteer-cluster'
import vanillaPuppeteer from 'puppeteer'

export async function fetchPhoneNumbers(countryUrls: string[]) {
  // Create a puppeteer cluster
  const puppeteer = addExtra(vanillaPuppeteer)
  puppeteer.use(Stealth())
  puppeteer.use(Recaptcha())
  const cluster = await Cluster.launch({
    puppeteer,
    maxConcurrency: 5,
    concurrency: Cluster.CONCURRENCY_CONTEXT,
  })
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url)
    await page.waitForSelector('.flag-icon', { timeout: 5_000 })
    const numbers = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[_ngcontent-serverapp-c3]'))
        .filter(
          (e: any) =>
            e.nodeName === 'A' &&
            e.className.includes('button') &&
            e.href.includes('https://quackr.io/temporary-numbers/'),
        )
        .map((e: any) => e.href),
    )
    return numbers
  })

  // Begin queueing tasks to get phone numbers from all countries concurrently
  const phoneNumbersPromises = countryUrls.map(country =>
    cluster.execute(country),
  )
  try {
    const phoneNumbers = await Promise.all(phoneNumbersPromises)
    let flattenedPhoneNumbers = [...new Set(phoneNumbers.flat())]
    return flattenedPhoneNumbers
  } catch (e) {
    console.error(e)
    throw e
  } finally {
    // Gracefully close the cluster
    await cluster.idle()
    await cluster.close()
  }
}
