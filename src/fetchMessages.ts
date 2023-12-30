import { addExtra } from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import Recaptcha from 'puppeteer-extra-plugin-recaptcha'
import { Cluster } from 'puppeteer-cluster'
import vanillaPuppeteer from 'puppeteer'
import { formatISO } from 'date-fns'
import fs from 'fs'
import path from 'path'
import { createObjectCsvWriter } from 'csv-writer'

function convertDynamicTimeToISO(timeString: string) {
  const units = timeString.split(' ')[1]
  let amount = parseInt(timeString.split(' ')[0])

  if (units.startsWith('minute')) {
    amount *= 60 * 1000
  } else if (units.startsWith('hour')) {
    amount *= 60 * 60 * 1000
  } else if (units.startsWith('day')) {
    amount *= 24 * 60 * 60 * 1000
  } else if (units.startsWith('week')) {
    amount *= 7 * 24 * 60 * 60 * 1000
  } else if (units.startsWith('month')) {
    amount *= 30 * 24 * 60 * 60 * 1000
  } else if (units.startsWith('year')) {
    amount *= 365 * 24 * 60 * 60 * 1000
  }

  const date = new Date(Date.now() - amount)
  return formatISO(date)
}

export async function fetchMessages(phoneUrls: string[]) {
  // Create a puppeteer cluster
  const puppeteer = addExtra(vanillaPuppeteer)
  puppeteer.use(Stealth())
  puppeteer.use(Recaptcha())
  const cluster = await Cluster.launch({
    puppeteer,
    maxConcurrency: 20,
    retryLimit: 2,
    retryDelay: 5_000,
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    monitor: true,
  })
  cluster.on('taskerror', (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`)
  })

  // Find or create CSV file
  const dataPath = path.join(__dirname, '..', 'messages.csv')
  const csvWriter = createObjectCsvWriter({
    path: dataPath,
    header: [
      { id: 'timestamp', title: 'TIMESTAMP' },
      { id: 'country', title: 'COUNTRY' },
      { id: 'sender', title: 'SENDER' },
      { id: 'receiver', title: 'RECEIVER' },
      { id: 'message', title: 'MESSAGE' },
    ],
    append: fs.existsSync(dataPath),
  })

  // Define task to fetch messages from a given phone number
  await cluster.task(async ({ page, data: url }) => {
    // Define task variables
    const receiver = `+${url.split('/').filter(Boolean).pop()}`
    const country = url.split('/').filter(Boolean).slice(-2, -1)[0] || ''

    // Go to the URL and attempt to load its contents
    console.log(`📞 Fetching ${receiver}`)
    await page.goto(url)
    try {
      await page.waitForSelector('td[_ngcontent-serverapp-c10]', {
        timeout: 5_000,
      })
    } catch (e) {
      // Identify if the page just has no messages
      const pageContent = await page.content()
      const tbodyRegex = /<tbody.*?>([\s\S]*?)<\/tbody>/
      const tbodyMatch = tbodyRegex.exec(pageContent)
      const tbody = tbodyMatch?.[0] || ''
      if (
        tbody ===
        '<tbody _ngcontent-serverapp-c10=""><!----><!----><!----><!----></tbody>'
      ) {
        console.warn(`❎ 0 messages found for ${receiver}`)
        return []
      } else {
        throw e
      }
    }

    // Extract messages from the page, if possible
    const messages = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr[_ngcontent-serverapp-c10]'))
        .filter((e: any) => e.nodeName === 'TR')
        .filter(
          tr =>
            Array.from(tr.children)[0]?.textContent != null &&
            Array.from(tr.children)[0]?.textContent !== '' &&
            Array.from(tr.children)[0]?.textContent !== 'Received',
        )
        .map(tr => {
          const tdArray = Array.from(tr.children)
          return {
            timestamp: tdArray[0]?.textContent || '',
            sender: tdArray[1]?.textContent || '',
            message: tdArray[2]?.textContent || '',
            receiver: '',
            country: '',
          }
        }),
    )

    // Prepare messages for CSV
    if (messages.length === 0) {
      console.warn(
        '⛔ Unexpected: No messages found despite TD elements existing in body',
      )
      return []
    }
    messages.forEach(message => {
      message.receiver = receiver
      message.country = country
      message.timestamp =
        message.timestamp != ''
          ? convertDynamicTimeToISO(message.timestamp)
          : ''
    })

    // Write messages to CSV
    await csvWriter.writeRecords(messages)
    console.log(
      `📨 ${messages.length} messages written for ${receiver} (${country})`,
    )

    return messages
  })

  // Begin queueing tasks to get phone numbers from all countries concurrently
  phoneUrls.forEach(phone => cluster.queue(phone))

  // Gracefully close the cluster
  await cluster.idle()
  await cluster.close()
}
