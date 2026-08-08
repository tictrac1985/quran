import { IntegrityGate } from './components/Integrity/IntegrityGate'
import { Reader } from './components/Reader/Reader'

export default function App() {
  return (
    <IntegrityGate>
      <Reader />
    </IntegrityGate>
  )
}
